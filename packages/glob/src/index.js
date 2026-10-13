import { readdir, stat } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join } from '@optiprune/pathx';

function opts(o = {}) { return { filesOnly: o.filesOnly ?? false, dirsOnly: o.dirsOnly ?? false, includeHidden: o.includeHidden ?? true, followSymlinks: o.followSymlinks ?? false, maxDepth: o.maxDepth ?? Infinity, signal: o.signal, filter: o.filter, onError: o.onError ?? 'throw', absolute: o.absolute ?? true }; }
function error(e, o, p) { if (o.onError === 'ignore') return false; if (typeof o.onError === 'function') return o.onError(e, p) !== false; throw e; }
function accepted(e, p, d, o) { if (o.dirsOnly && !e.isDirectory()) return false; if (o.filesOnly && !e.isFile()) return false; return !o.filter || o.filter(p, e, d) !== false; }
function root(p) { return p && (p[0] === '/' || p[1] === ':') ? p : join(process.cwd(), p); }
function view(entry, directory) { return directory ? { name: entry.name, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => entry.isSymbolicLink() } : entry; }
function expandBraces(pattern) {
  const open = pattern.indexOf('{'); if (open < 0) return [pattern];
  let depth = 0, close = -1;
  for (let i = open; i < pattern.length; i++) { if (pattern[i] === '{') depth++; else if (pattern[i] === '}' && --depth === 0) { close = i; break; } }
  if (close < 0) return [pattern];
  const choices = pattern.slice(open + 1, close).split(','), out = [];
  for (const choice of choices) for (const expanded of expandBraces(pattern.slice(0, open) + choice + pattern.slice(close + 1))) out.push(expanded);
  return out;
}
function globRegex(pattern) {
  let source = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') { if (pattern[i + 2] === '/') { source += '(?:.*/)?'; i += 2; } else { source += '.*'; i++; } }
    else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else if (c === '[') { const end = pattern.indexOf(']', i + 1); if (end > i) { source += pattern.slice(i, end + 1); i = end; } else source += '\\['; }
    else source += /[\\^$+.()|{}]/.test(c) ? '\\' + c : c;
  }
  return new RegExp(source + '$');
}
function compileSegment(segment) {
  if (segment === '*') return () => true;
  if (segment[0] === '*' && !/[?\[\]]/.test(segment.slice(1))) {
    const suffix = segment.slice(1);
    if (!suffix) return () => true;
    return name => name.length > suffix.length && name.endsWith(suffix);
  }
  if (!/[?*\[\]]/.test(segment)) return name => name === segment;
  const matcher = globRegex(segment);
  return name => matcher.test(name);
}
function magicSegment(segment) { return segment === '**' || /[*?\[\]]/.test(segment); }

// A small NFA over path segments. It handles globstar at any depth, so leaf
// shortcuts are not tied to one exact pattern shape.
function compileGlob(pattern) {
  const alternatives = expandBraces(pattern).map(value => value.split('/'));
  const compiled = alternatives.map(parts => parts.map(part => part === '**' ? null : compileSegment(part)));
  const staticPrefix = [];
  for (let i = 0; ; i++) {
    const part = alternatives[0]?.[i];
    if (!part || magicSegment(part) || alternatives.some(parts => parts[i] !== part)) break;
    staticPrefix.push(part);
  }
  const STATE_STRIDE = 2048;
  const encode = (alternative, index) => alternative * STATE_STRIDE + index;
  const decodeAlternative = state => Math.floor(state / STATE_STRIDE);
  const decodeIndex = state => state % STATE_STRIDE;
  const marks = new Uint32Array((alternatives.length + 1) * STATE_STRIDE); let markGeneration = 0;
  const scratchBefore = [], scratchNext = [], scratchAfter = [];
  function closure(states, result) {
    if (++markGeneration === 0xffffffff) { marks.fill(0); markGeneration = 1; }
    result.length = 0; const stack = [];
    for (const state of states) stack.push(state);
    while (stack.length) {
      const state = stack.pop(); if (marks[state] === markGeneration) continue; marks[state] = markGeneration; result.push(state);
      const alternative = decodeAlternative(state), index = decodeIndex(state), parts = alternatives[alternative];
      if (parts[index] === '**') stack.push(encode(alternative, index + 1));
    }
    return result;
  }
  function advance(states, name) {
    scratchNext.length = 0;
    for (const state of closure(states, scratchBefore)) {
      const alternative = decodeAlternative(state), index = decodeIndex(state), parts = alternatives[alternative];
      if (index >= parts.length) continue;
      if (parts[index] === '**') scratchNext.push(state);
      else if (compiled[alternative][index](name)) scratchNext.push(encode(alternative, index + 1));
    }
    return closure(scratchNext, scratchAfter).slice();
  }
  function test(value) {
    let states = initial;
    for (const part of value.split('/')) { states = advance(states, part); if (!states.length) return false; }
    return complete(states);
  }
  const initial = closure(alternatives.map((_, i) => encode(i, 0)), []);
  const complete = states => states.some(state => decodeIndex(state) >= alternatives[decodeAlternative(state)].length);
  let initialAtStaticBase = initial;
  for (const part of staticPrefix) initialAtStaticBase = advance(initialAtStaticBase, part);
  const remaining = alternatives.map(parts => parts.slice(staticPrefix.length));
  const leafMatchers = remaining.filter(parts => parts.length === 2 && parts[0] === '**').map(parts => compileSegment(parts[1]));
  const leaf = leafMatchers.length === remaining.length ? name => leafMatchers.some(match => match(name)) : null;
  return { advance, complete, test, initialAtStaticBase, staticPrefix, leaf };
}
function compilePatternSet(patterns, ignores = []) {
  ignores = Array.isArray(ignores) ? ignores : [ignores];
  const positives = patterns.filter(pattern => !pattern.startsWith('!')).map(pattern => compileGlob(pattern));
  const negatives = patterns.filter(pattern => pattern.startsWith('!')).map(pattern => compileGlob(pattern.slice(1))).concat(ignores.map(pattern => compileGlob(pattern.startsWith('!') ? pattern.slice(1) : pattern)));
  const hasNegatives = negatives.length > 0;
  const ignored = hasNegatives ? value => negatives.some(pattern => pattern.test(value)) : null;
  const positive = positives.length ? positives : [compileGlob('**')];
  if (positive.length === 1) {
    const matcher = positive[0];
    return { ...matcher, hasNegatives, ignored };
  }
  return {
    staticPrefix: [],
    initialAtStaticBase: positive.map(pattern => pattern.initialAtStaticBase),
    advance(states, name) { return positive.map((pattern, index) => pattern.advance(states[index], name)); },
    complete(states) { return states.some((state, index) => positive[index].complete(state)); },
    test(value) { return positive.some(pattern => pattern.test(value)); },
    leaf: null,
    hasNegatives,
    ignored
  };
}
function hasGlobMagic(value) { return /[*?{}\[\]]/.test(value); }

export async function* crawl(input, inputOptions) {
  const o = opts(inputOptions), stack = [{ path: o.absolute ? root(input) : input, depth: 0 }], seen = o.followSymlinks ? new Set() : null;
  while (stack.length) {
    if (o.signal?.aborted) throw o.signal.reason ?? new Error('crawl aborted');
    const current = stack.pop(); let entries;
    try { entries = await readdir(current.path, { withFileTypes: true }); } catch (e) { if (error(e, o, current.path)) continue; }
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]; if (!o.includeHidden && entry.name[0] === '.') continue;
      const p = join(current.path, entry.name); let dir = entry.isDirectory();
      if (entry.isSymbolicLink() && o.followSymlinks) { try { dir = (await stat(p)).isDirectory(); } catch (e) { if (error(e, o, p)) continue; } }
      const e = view(entry, dir); if (accepted(e, p, current.depth + 1, o)) yield p;
      if (dir && current.depth < o.maxDepth && (!entry.isSymbolicLink() || o.followSymlinks)) {
        if (seen) { try { const s = await stat(p), key = s.dev + ':' + s.ino; if (seen.has(key)) continue; seen.add(key); } catch (x) { if (error(x, o, p)) continue; } }
        stack.push({ path: p, depth: current.depth + 1 });
      }
    }
  }
}
export function* crawlSync(input, inputOptions) {
  const o = opts(inputOptions), stack = [{ path: o.absolute ? root(input) : input, depth: 0 }], seen = o.followSymlinks ? new Set() : null;
  while (stack.length) {
    const current = stack.pop(); let entries;
    try { entries = readdirSync(current.path, { withFileTypes: true }); } catch (e) { if (error(e, o, current.path)) continue; }
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]; if (!o.includeHidden && entry.name[0] === '.') continue;
      const p = join(current.path, entry.name); let dir = entry.isDirectory();
      if (entry.isSymbolicLink() && o.followSymlinks) { try { dir = statSync(p).isDirectory(); } catch (e) { if (error(e, o, p)) continue; } }
      const e = view(entry, dir); if (accepted(e, p, current.depth + 1, o)) yield p;
      if (dir && current.depth < o.maxDepth && (!entry.isSymbolicLink() || o.followSymlinks)) {
        if (seen) { try { const s = statSync(p), key = s.dev + ':' + s.ino; if (seen.has(key)) continue; seen.add(key); } catch (x) { if (error(x, o, p)) continue; } }
        stack.push({ path: p, depth: current.depth + 1 });
      }
    }
  }
}

export async function crawlAll(rootPath, inputOptions = {}) {
  const patternList = Array.isArray(rootPath) ? rootPath : [rootPath];
  const inputIsPattern = (Array.isArray(rootPath) || typeof rootPath === 'string') && (inputOptions.cwd || patternList.some(hasGlobMagic) || patternList.some(pattern => pattern.startsWith('!')) || inputOptions.ignore);
  const pattern = inputIsPattern ? patternList : null;
  const cwd = inputIsPattern ? (inputOptions.cwd ?? process.cwd()) : rootPath;
  const matcher = inputIsPattern ? compilePatternSet(pattern, inputOptions.ignore ?? []) : null;
  const base = inputIsPattern && matcher.staticPrefix.length ? join(cwd, ...matcher.staticPrefix) : cwd;
  const o = opts(inputIsPattern ? { ...inputOptions, filesOnly: true, includeHidden: inputOptions.includeHidden ?? false } : inputOptions);
  if (o.followSymlinks || o.signal || typeof o.onError === 'function') {
    if (!inputIsPattern) { const out = []; for await (const p of crawl(rootPath, inputOptions)) out.push(p); return out; }
    const absoluteCwd = root(cwd), fallbackOptions = { ...inputOptions, filesOnly: true, includeHidden: inputOptions.includeHidden ?? false, filter: (p, entry, depth) => {
      if (inputOptions.filter && inputOptions.filter(p, entry, depth) === false) return false;
      const relativePath = p.startsWith(absoluteCwd + '/') ? p.slice(absoluteCwd.length + 1) : p;
      return matcher.test(relativePath) && (!matcher.ignored || !matcher.ignored(relativePath));
    } };
    const out = []; for await (const p of crawl(absoluteCwd, fallbackOptions)) out.push(p); return out;
  }
  const out = [];
  let queue = new Array(1024), head = 0, tail = 0;
  const enqueue = item => {
    if (tail - head >= queue.length) {
      const next = new Array(queue.length * 2);
      for (let i = head; i < tail; i++) next[i - head] = queue[i % queue.length];
      queue = next; tail -= head; head = 0;
    }
    queue[tail % queue.length] = item; tail++;
  };
  const dequeue = () => { if (head >= tail) return undefined; const index = head % queue.length, item = queue[index]; queue[index] = undefined; head++; return item; };
  enqueue({ path: (o.absolute ? root(base) : base).replace(/\/$/, '') + '/', relative: matcher?.staticPrefix.join('/') ?? '', depth: matcher?.staticPrefix.length ?? 0, states: matcher?.initialAtStaticBase });
  let active = 0, failed = false, resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  async function processBatch(batch) {
    if (o.signal?.aborted) throw o.signal.reason ?? new Error('crawl aborted');
    let entries;
    try { entries = await readdir(batch.path, { withFileTypes: true }); }
    catch (e) { if (error(e, o, batch.path)) return; entries = []; }
    for (const entry of entries) {
      if (!o.includeHidden && entry.name[0] === '.') continue;
      const isDir = entry.isDirectory();
      let relativePath;
      if (matcher?.hasNegatives) {
        relativePath = batch.relative ? batch.relative + '/' + entry.name : entry.name;
        if (matcher.ignored(relativePath) || (isDir && matcher.ignored(relativePath + '/'))) continue;
      }
      if (matcher && !isDir && matcher.leaf) {
        if (!matcher.leaf(entry.name)) continue;
        const p = batch.path + entry.name;
        if (accepted(entry, p, batch.depth + 1, o)) out.push(p);
        continue;
      }
      let states = batch.states;
      if (matcher) { states = matcher.advance(batch.states, entry.name); if (!states.length) continue; }
      if (matcher && !isDir && !matcher.complete(states)) continue;
      const p = batch.path + entry.name;
      if (accepted(entry, p, batch.depth + 1, o) && (!matcher || matcher.complete(states))) out.push(p);
      if (isDir && batch.depth < o.maxDepth && (!matcher || states.length)) enqueue({ path: p + '/', relative: matcher?.hasNegatives ? (relativePath ?? (batch.relative ? batch.relative + '/' + entry.name : entry.name)) : undefined, depth: batch.depth + 1, states });
    }
  }
  function pump() {
    while (!failed && active < 32 && head < tail) {
      const batch = dequeue(); active++;
      processBatch(batch).then(() => { active--; if (!active && head >= tail) resolveDone(); else pump(); }, e => { failed = true; rejectDone(e); });
    }
    if (!failed && !active && head >= tail) resolveDone();
  }
  pump();
  await done;
  return out;
}
