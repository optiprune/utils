import { realpath, readdir, stat } from 'node:fs/promises';
import { readdirSync, realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDynamicPattern, join } from '@optiprune/pathx';

export { isDynamicPattern, escapePath, convertPathToPattern } from '@optiprune/pathx';

function opts(o = {}) {
  const onlyDirectories = o.onlyDirectories ?? o.dirsOnly ?? false;
  const onlyFiles = o.onlyFiles ?? (onlyDirectories ? false : (o.filesOnly ?? true));
  const dot = o.dot ?? o.includeHidden ?? true;
  const followSymbolicLinks = o.followSymbolicLinks ?? o.followSymlinks ?? true;
  const deep = o.deep ?? o.maxDepth ?? Infinity;
  return {
    onlyFiles,
    onlyDirectories,
    dot,
    followSymbolicLinks,
    deep,
    // Internal compatibility aliases keep the traversal code compact.
    filesOnly: onlyFiles,
    dirsOnly: onlyDirectories,
    includeHidden: dot,
    followSymlinks: followSymbolicLinks,
    maxDepth: deep,
    signal: o.signal,
    filter: o.filter,
    onError: o.onError ?? 'throw',
    absolute: o.absolute ?? true,
    shouldTraverse: o.shouldTraverse,
  };
}
function error(e, o, p) {
  if (o.onError === 'ignore') return false;
  if (typeof o.onError === 'function') return o.onError(e, p) !== false;
  throw e;
}
function accepted(e, p, d, o) {
  if (o.dirsOnly && !e.isDirectory()) return false;
  if (o.filesOnly && !e.isFile()) return false;
  return !o.filter || o.filter(p, e, d) !== false;
}
function root(p) {
  return p && (p[0] === '/' || p[1] === ':') ? p : join(process.cwd(), p);
}
function view(entry, directory) {
  return directory
    ? {
        name: entry.name,
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => entry.isSymbolicLink(),
      }
    : entry;
}
export const MAX_RANGE_COUNT = 1000;

function rangeExpansion(value) {
  const match = /^(-?\d+|[A-Za-z])\.\.(-?\d+|[A-Za-z])(?:\.\.(-?\d+))?$/.exec(value);
  if (!match) return null;
  const [, startValue, endValue, stepValue] = match;
  const startIsNum = /^-?\d+$/.test(startValue);
  const endIsNum = /^-?\d+$/.test(endValue);
  if (startIsNum !== endIsNum) return null;
  const numeric = startIsNum;
  if (!numeric && (startValue.length !== 1 || endValue.length !== 1)) return null;
  const start = numeric ? Number(startValue) : startValue.charCodeAt(0);
  const end = numeric ? Number(endValue) : endValue.charCodeAt(0);
  const direction = start <= end ? 1 : -1;
  const step = Math.abs(Number(stepValue ?? 1)) * direction;
  if (!Number.isFinite(step) || step === 0) return null;
  const count = Math.floor(Math.abs(end - start) / Math.abs(step)) + 1;
  if (count > MAX_RANGE_COUNT) return { literal: `\\{${value}\\}` };
  if (count === 1) return [numeric ? String(start) : String.fromCharCode(start)];
  if (!numeric && Math.abs(step) === 1 && start <= end) {
    const first = String.fromCharCode(start),
      last = String.fromCharCode(end);
    return [`[${first}-${last}]`];
  }
  if (
    numeric &&
    Math.abs(step) === 1 &&
    start <= end &&
    start >= 0 &&
    end <= 9 &&
    startValue.length === 1 &&
    endValue.length === 1
  )
    return [`[${start}-${end}]`];
  const values = [];
  const width = numeric
    ? Math.max(startValue.replace(/^-/, '').length, endValue.replace(/^-/, '').length)
    : 0;
  for (let current = start; direction > 0 ? current <= end : current >= end; current += step) {
    const value = numeric
      ? String(Math.abs(current)).padStart(width, '0')
      : String.fromCharCode(current);
    values.push(numeric && current < 0 ? `-${value}` : value);
  }
  return values;
}

function expandBraces(pattern) {
  const open = pattern.indexOf('{');
  if (open < 0) return [pattern];
  let depth = 0,
    close = -1;
  for (let i = open; i < pattern.length; i++) {
    if (pattern[i] === '{') depth++;
    else if (pattern[i] === '}' && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) return [pattern];
  const body = pattern.slice(open + 1, close);
  if (body.includes(',') && !body.includes('{') && open === 0 && close === pattern.length - 1)
    return [pattern];
  const range = rangeExpansion(body);
  const choices = range ? (range.literal ? [range.literal] : range) : body.split(','),
    out = [];
  for (const choice of choices)
    for (const expanded of expandBraces(pattern.slice(0, open) + choice + pattern.slice(close + 1)))
      out.push(expanded);
  return out;
}
function splitAlternatives(value) {
  const result = [],
    start = 0;
  let depth = 0,
    from = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === '|' && depth === 0) {
      result.push(value.slice(from, i));
      from = i + 1;
    }
  }
  result.push(value.slice(from));
  return result;
}

function findClosing(value, open) {
  let depth = 0;
  for (let i = open; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function globRegex(pattern, fragment = false) {
  let source = fragment ? '' : '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      source += escapeRegex(pattern[++i]);
      continue;
    }
    if ('@?*+!'.includes(c) && pattern[i + 1] === '(') {
      const end = findClosing(pattern, i + 1);
      if (end > i) {
        const inner = splitAlternatives(pattern.slice(i + 2, end))
          .map(part => globRegex(part, true))
          .join('|');
        if (c === '!') source += `(?!(?:${inner})$)[^/]+`;
        else source += `(?:${inner})${c === '@' ? '' : c}`;
        i = end;
        continue;
      }
    }
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else {
        source += '.*';
        i++;
      }
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else if (c === '[') {
      let end = i + (pattern[i + 1] === '!' || pattern[i + 1] === '^' ? 2 : 1);
      if (pattern[end] === ']') end++;
      end = pattern.indexOf(']', end);
      if (end > i) {
        const characterClass = pattern.slice(i, end + 1);
        source += characterClass[1] === '!' ? `[^${characterClass.slice(2)}` : characterClass;
        i = end;
      } else source += '\\[';
    } else source += escapeRegex(c);
  }
  return fragment ? source : new RegExp(source + '$');
}

function escapeRegex(value) {
  return value.replace(/[\\^$+.()|{}]/g, '\\$&');
}

function classifySegment(segment) {
  const setMatch = /^\{([^{}]+(?:,[^{}]+)+)\}$/.exec(segment);
  if (setMatch) return { tier: 'set', set: new Set(setMatch[1].split(',')) };
  const suffixSetMatch = /^\*\{([^{}]+(?:,[^{}]+)+)\}$/.exec(segment);
  if (suffixSetMatch) return { tier: 'suffixSet', suffixes: suffixSetMatch[1].split(',') };
  if (!/[?*\[\]{}@+!()]/.test(segment)) return { tier: 'exact' };
  if (segment[0] === '*' && !/[?*\[\]{}@+!()]/.test(segment.slice(1)))
    return { tier: 'suffix', suffix: segment.slice(1) };
  return { tier: 'regex', matcher: globRegex(segment) };
}

function compileSegment(segment) {
  const classification = classifySegment(segment);
  if (classification.tier === 'exact') return name => name === segment;
  if (classification.tier === 'set') return name => classification.set.has(name);
  if (classification.tier === 'suffixSet')
    return name =>
      classification.suffixes.some(suffix => name.length > suffix.length && name.endsWith(suffix));
  if (classification.tier === 'suffix') {
    if (!classification.suffix) return () => true;
    return name =>
      name.length > classification.suffix.length && name.endsWith(classification.suffix);
  }
  return name => classification.matcher.test(name);
}
function magicSegment(segment) {
  return segment === '**' || /[*?\[\]{}@+!()]/.test(segment);
}

function isNegatedPattern(pattern) {
  return pattern.startsWith('!') && !pattern.startsWith('!(');
}

function normalizeStaticPath(value) {
  return value
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/{2,}/g, '/');
}

function relativeTo(base, value) {
  const normalizedBase = normalizeStaticPath(base).replace(/\/$/, '');
  const normalizedValue = normalizeStaticPath(value);
  return normalizedValue.startsWith(`${normalizedBase}/`)
    ? normalizedValue.slice(normalizedBase.length + 1)
    : normalizedValue;
}

function testNegative(pattern, value) {
  if (pattern.leaf && pattern.staticPrefix.length === 0)
    return pattern.leaf(value.slice(value.lastIndexOf('/') + 1));
  return pattern.test(value);
}

function hasUnescapedQuote(value) {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') {
      i++;
      continue;
    }
    if (value[i] === '"' || value[i] === "'") return true;
  }
  return false;
}

function isStaticPattern(pattern) {
  return !isDynamicPattern(pattern) && !hasUnescapedQuote(pattern);
}

// A small NFA over path segments. It handles globstar at any depth, so leaf
// shortcuts are not tied to one exact pattern shape.
function compileGlob(pattern) {
  const alternatives = expandBraces(pattern).map(value => value.split('/'));
  const compiled = alternatives.map(parts =>
    parts.map(part => (part === '**' ? null : compileSegment(part))),
  );
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
  const marks = new Uint32Array((alternatives.length + 1) * STATE_STRIDE);
  let markGeneration = 0;
  const scratchBefore = [],
    scratchNext = [],
    scratchAfter = [];
  function closure(states, result) {
    if (++markGeneration === 0xffffffff) {
      marks.fill(0);
      markGeneration = 1;
    }
    result.length = 0;
    const stack = [];
    for (const state of states) stack.push(state);
    while (stack.length) {
      const state = stack.pop();
      if (marks[state] === markGeneration) continue;
      marks[state] = markGeneration;
      result.push(state);
      const alternative = decodeAlternative(state),
        index = decodeIndex(state),
        parts = alternatives[alternative];
      if (parts[index] === '**') stack.push(encode(alternative, index + 1));
    }
    return result;
  }
  function advance(states, name) {
    scratchNext.length = 0;
    for (const state of closure(states, scratchBefore)) {
      const alternative = decodeAlternative(state),
        index = decodeIndex(state),
        parts = alternatives[alternative];
      if (index >= parts.length) continue;
      if (parts[index] === '**') scratchNext.push(state);
      else if (compiled[alternative][index](name)) scratchNext.push(encode(alternative, index + 1));
    }
    return closure(scratchNext, scratchAfter).slice();
  }
  function test(value) {
    let states = initial;
    for (const part of value.split('/')) {
      states = advance(states, part);
      if (!states.length) return false;
    }
    return complete(states);
  }
  const initial = closure(
    alternatives.map((_, i) => encode(i, 0)),
    [],
  );
  const complete = states =>
    states.some(state => decodeIndex(state) >= alternatives[decodeAlternative(state)].length);
  let initialAtStaticBase = initial;
  for (const part of staticPrefix) initialAtStaticBase = advance(initialAtStaticBase, part);
  const remaining = alternatives.map(parts => parts.slice(staticPrefix.length));
  const leafMatchers = remaining
    .filter(parts => parts.length === 2 && parts[0] === '**')
    .map(parts => compileSegment(parts[1]));
  const leaf =
    leafMatchers.length === remaining.length
      ? name => leafMatchers.some(match => match(name))
      : null;
  return { advance, complete, test, initialAtStaticBase, staticPrefix, leaf };
}
export function compilePatternSet(patterns, ignores = []) {
  ignores = Array.isArray(ignores) ? ignores : [ignores];
  const staticExact = new Set();
  const staticPrefixes = new Set();
  const dynamicPatterns = [];
  for (const pattern of patterns) {
    if (isNegatedPattern(pattern)) continue;
    if (!isStaticPattern(pattern)) {
      dynamicPatterns.push(pattern);
      continue;
    }
    const normalized = normalizeStaticPath(pattern);
    staticExact.add(normalized);
    for (
      let slash = normalized.lastIndexOf('/');
      slash !== -1;
      slash = normalized.lastIndexOf('/', slash - 1)
    )
      staticPrefixes.add(normalized.slice(0, slash));
  }
  const positives = dynamicPatterns.map(pattern => compileGlob(pattern));
  const negatives = patterns
    .filter(pattern => isNegatedPattern(pattern))
    .map(pattern => compileGlob(pattern.slice(1)))
    .concat(
      ignores.map(pattern => compileGlob(isNegatedPattern(pattern) ? pattern.slice(1) : pattern)),
    );
  const hasNegatives = negatives.length > 0;
  const ignored = hasNegatives
    ? value => negatives.some(pattern => testNegative(pattern, value))
    : null;
  const leafNegatives = negatives.filter(
    pattern => pattern.leaf && pattern.staticPrefix.length === 0,
  );
  const ignoredLeaf = leafNegatives.length
    ? value => leafNegatives.some(pattern => pattern.leaf(value))
    : null;
  const pathNegatives = negatives.filter(
    pattern => !pattern.leaf || pattern.staticPrefix.length > 0,
  );
  const ignoredPath = pathNegatives.length
    ? value => pathNegatives.some(pattern => pattern.test(value))
    : null;
  const positive = positives.length ? positives : [compileGlob('**')];
  const hasDynamic = dynamicPatterns.length > 0;
  const common = {
    staticExact,
    staticPrefixes,
    hasStatics: staticExact.size > 0,
    hasDynamic,
    shouldTraverse(dirRelPath) {
      return hasDynamic || staticPrefixes.has(normalizeStaticPath(dirRelPath));
    },
  };
  if (positive.length === 1) {
    const matcher = positive[0];
    return {
      ...matcher,
      ...common,
      test(value) {
        const normalized = normalizeStaticPath(value);
        return staticExact.has(normalized) || (positives.length > 0 && matcher.test(normalized));
      },
      hasNegatives,
      ignored,
      ignoredLeaf,
      ignoredPath,
    };
  }
  return {
    ...common,
    staticPrefix: [],
    initialAtStaticBase: positive.map(pattern => pattern.initialAtStaticBase),
    advance(states, name) {
      return positive.map((pattern, index) => pattern.advance(states[index], name));
    },
    complete(states) {
      return states.some((state, index) => positive[index].complete(state));
    },
    test(value) {
      const normalized = normalizeStaticPath(value);
      return staticExact.has(normalized) || positive.some(pattern => pattern.test(normalized));
    },
    leaf: null,
    hasNegatives,
    ignored,
    ignoredLeaf,
    ignoredPath,
  };
}
function hasGlobMagic(value) {
  return /[*?{}\[\]]/.test(value);
}

function normalizeCwd(cwd) {
  return cwd instanceof URL ? fileURLToPath(cwd) : (cwd ?? process.cwd());
}

export async function* crawl(input, inputOptions) {
  const o = opts(inputOptions),
    stack = [{ path: o.absolute ? root(input) : input, relative: '', depth: 0 }],
    seenPaths = o.followSymlinks ? new Set([root(input).replace(/\/$/, '')]) : null;
  while (stack.length) {
    if (o.signal?.aborted) throw o.signal.reason ?? new Error('crawl aborted');
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch (e) {
      if (error(e, o, current.path)) continue;
      entries = [];
    }
    if (o.followSymlinks && entries.some(entry => entry.isSymbolicLink()))
      entries.sort((a, b) => Number(b.isSymbolicLink()) - Number(a.isSymbolicLink()));
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const depth = current.depth + 1;
      if (depth > o.maxDepth) continue;
      if (!o.includeHidden && entry.name[0] === '.') continue;
      const p = join(current.path, entry.name);
      const relativePath = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      let dir = entry.isDirectory();
      const isSymlink = entry.isSymbolicLink();
      if (isSymlink && o.followSymlinks) {
        try {
          const target = await stat(p);
          dir = target.isDirectory();
          if (dir && seenPaths) {
            const targetPath = await realpath(p);
            if (seenPaths.has(targetPath)) continue;
            seenPaths.add(targetPath);
          }
        } catch (e) {
          if (error(e, o, p)) continue;
        }
      }
      const e = view(entry, dir);
      if (accepted(e, p, depth, o)) yield p;
      if (dir && current.depth < o.maxDepth && (!isSymlink || o.followSymlinks)) {
        if (o.shouldTraverse && !o.shouldTraverse(relativePath)) continue;
        if (seenPaths) {
          const realPath = await realpath(p).catch(() => p);
          if (seenPaths.has(realPath)) continue;
          seenPaths.add(realPath);
        }
        stack.push({ path: p, relative: relativePath, depth: current.depth + 1 });
      }
    }
  }
}
export function* crawlSync(input, inputOptions) {
  const o = opts(inputOptions),
    stack = [{ path: o.absolute ? root(input) : input, relative: '', depth: 0 }],
    seenPaths = o.followSymlinks ? new Set([root(input).replace(/\/$/, '')]) : null;
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current.path, { withFileTypes: true });
    } catch (e) {
      if (error(e, o, current.path)) continue;
      entries = [];
    }
    if (o.followSymlinks && entries.some(entry => entry.isSymbolicLink()))
      entries.sort((a, b) => Number(b.isSymbolicLink()) - Number(a.isSymbolicLink()));
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const depth = current.depth + 1;
      if (depth > o.maxDepth) continue;
      if (!o.includeHidden && entry.name[0] === '.') continue;
      const p = join(current.path, entry.name);
      const relativePath = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      let dir = entry.isDirectory();
      const isSymlink = entry.isSymbolicLink();
      if (isSymlink && o.followSymlinks) {
        try {
          const target = statSync(p);
          dir = target.isDirectory();
          if (dir && seenPaths) {
            const targetPath = realpathSync(p);
            if (seenPaths.has(targetPath)) continue;
            seenPaths.add(targetPath);
          }
        } catch (e) {
          if (error(e, o, p)) continue;
        }
      }
      const e = view(entry, dir);
      if (accepted(e, p, depth, o)) yield p;
      if (dir && current.depth < o.maxDepth && (!isSymlink || o.followSymlinks)) {
        if (o.shouldTraverse && !o.shouldTraverse(relativePath)) continue;
        if (seenPaths) {
          const realPath = (() => {
            try {
              return realpathSync(p);
            } catch {
              return p;
            }
          })();
          if (seenPaths.has(realPath)) continue;
          seenPaths.add(realPath);
        }
        stack.push({ path: p, relative: relativePath, depth: current.depth + 1 });
      }
    }
  }
}

export async function crawlAll(rootPath, inputOptions = {}) {
  const cwdPath = normalizeCwd(inputOptions.cwd);
  const options = { ...inputOptions, cwd: cwdPath };
  const patternList = Array.isArray(rootPath) ? rootPath : [rootPath];
  const inputIsPattern =
    (Array.isArray(rootPath) || typeof rootPath === 'string') &&
    (inputOptions.cwd ||
      patternList.some(hasGlobMagic) ||
      patternList.some(pattern => pattern.startsWith('!')) ||
      options.ignore);
  const pattern = inputIsPattern ? patternList : null;
  const cwd = inputIsPattern ? options.cwd : rootPath;
  const matcher = inputIsPattern ? compilePatternSet(pattern, options.ignore ?? []) : null;
  const base =
    inputIsPattern && matcher.staticPrefix.length ? join(cwd, ...matcher.staticPrefix) : cwd;
  const o = opts(
    inputIsPattern
      ? {
          ...options,
          onlyFiles: options.onlyDirectories ? false : (options.onlyFiles ?? true),
          filesOnly: options.onlyDirectories ? false : (options.filesOnly ?? true),
          dot: options.dot ?? false,
        }
      : options,
  );
  if (options.absolute === false) {
    if (!inputIsPattern) {
      const out = [];
      for await (const p of crawl(rootPath, options)) out.push(p);
      return out;
    }
    const absoluteCwd = join(root(cwd)),
      onlyDirectories = o.onlyDirectories,
      filesOnly = o.onlyFiles,
      fallbackOptions = {
        ...options,
        filesOnly,
        dirsOnly: onlyDirectories,
        includeHidden: o.dot,
        filter: (p, entry, depth) => {
          if (options.filter && options.filter(p, entry, depth) === false) return false;
          const relativePath = relativeTo(absoluteCwd, p);
          return matcher.test(relativePath) && (!matcher.ignored || !matcher.ignored(relativePath));
        },
        shouldTraverse: relativePath => matcher.shouldTraverse(relativePath),
      };
    const out = [];
    for await (const p of crawl(absoluteCwd, fallbackOptions)) out.push(p);
    return o.absolute ? out : out.map(p => relativeTo(absoluteCwd, p));
  }
  const out = [];
  let queue = new Array(1024),
    head = 0,
    tail = 0;
  const enqueue = item => {
    if (tail - head >= queue.length) {
      const next = new Array(queue.length * 2);
      for (let i = head; i < tail; i++) next[i - head] = queue[i % queue.length];
      queue = next;
      tail -= head;
      head = 0;
    }
    queue[tail % queue.length] = item;
    tail++;
  };
  const dequeue = () => {
    if (head >= tail) return undefined;
    const index = head % queue.length,
      item = queue[index];
    queue[index] = undefined;
    head++;
    return item;
  };
  enqueue({
    path: (o.absolute ? root(base) : base).replace(/\/$/, '') + '/',
    relative: matcher?.staticPrefix.join('/') ?? '',
    depth: matcher?.staticPrefix.length ?? 0,
    states: matcher?.initialAtStaticBase,
  });
  const seenPaths = o.followSymlinks ? new Set([root(base).replace(/\/$/, '')]) : null;
  let active = 0,
    failed = false,
    resolveDone,
    rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  async function processBatch(batch) {
    if (o.signal?.aborted) throw o.signal.reason ?? new Error('crawl aborted');
    let entries;
    try {
      entries = await readdir(batch.path, { withFileTypes: true });
    } catch (e) {
      if (error(e, o, batch.path)) return;
      entries = [];
    }
    if (o.followSymlinks && entries.some(entry => entry.isSymbolicLink()))
      entries.sort((a, b) => Number(a.isSymbolicLink()) - Number(b.isSymbolicLink()));
    for (const entry of entries) {
      const depth = batch.depth + 1;
      if (depth > o.maxDepth) continue;
      if (!o.includeHidden && entry.name[0] === '.') continue;
      const isSymlink = entry.isSymbolicLink();
      let isDir = entry.isDirectory();
      let relativePath;
      const directFile = !isDir && !isSymlink;
      if (directFile && matcher?.ignoredLeaf?.(entry.name)) continue;
      const p = batch.path + entry.name;
      if (isSymlink && o.followSymlinks) {
        try {
          const target = await stat(p);
          isDir = target.isDirectory();
          if (isDir && seenPaths) {
            const targetPath = await realpath(p);
            if (seenPaths.has(targetPath)) continue;
            seenPaths.add(targetPath);
          }
        } catch (e) {
          if (error(e, o, p)) continue;
        }
      }
      if (o.onlyDirectories && !isDir) continue;
      if (matcher?.hasNegatives) {
        if (isDir) {
          relativePath ??= batch.relative ? batch.relative + '/' + entry.name : entry.name;
          if (matcher.ignored(relativePath) || matcher.ignored(relativePath + '/')) continue;
        } else if (
          (!directFile && matcher.ignoredLeaf?.(entry.name)) ||
          (matcher.ignoredPath &&
            matcher.ignoredPath(batch.relative ? batch.relative + '/' + entry.name : entry.name))
        )
          continue;
      }
      if (matcher && !isDir && matcher.leaf) {
        if (!matcher.leaf(entry.name)) continue;
        if (accepted(entry, p, depth, o)) out.push(p);
        continue;
      }
      let states = batch.states;
      if (matcher) {
        states = isDir && matcher.leaf ? batch.states : matcher.advance(batch.states, entry.name);
        if (!states.length) continue;
      }
      if (matcher && !isDir && !matcher.complete(states)) continue;
      if (accepted(entry, p, depth, o) && (!matcher || matcher.complete(states))) out.push(p);
      if (
        isDir &&
        batch.depth < o.maxDepth &&
        (!matcher || states.length) &&
        (!isSymlink || o.followSymlinks) &&
        (!matcher ||
          matcher.shouldTraverse(
            relativePath ?? (batch.relative ? batch.relative + '/' + entry.name : entry.name),
          ))
      ) {
        if (seenPaths) {
          const realPath = await realpath(p).catch(() => p);
          if (seenPaths.has(realPath)) continue;
          seenPaths.add(realPath);
        }
        enqueue({
          path: p + '/',
          relative: matcher?.hasNegatives
            ? (relativePath ?? (batch.relative ? batch.relative + '/' + entry.name : entry.name))
            : undefined,
          depth: batch.depth + 1,
          states,
        });
      }
    }
  }
  function pump() {
    while (!failed && active < 32 && head < tail) {
      const batch = dequeue();
      active++;
      processBatch(batch).then(
        () => {
          active--;
          if (!active && head >= tail) resolveDone();
          else pump();
        },
        e => {
          failed = true;
          rejectDone(e);
        },
      );
    }
    if (!failed && !active && head >= tail) resolveDone();
  }
  pump();
  await done;
  return out;
}
