import { statSync } from 'node:fs';
import { resolve } from '@optiprune/pathx';
import { fileURLToPath } from 'node:url';
import { crawl, crawlAll, crawlSync, compilePatternSet } from './index.js';

export { crawl, crawlAll, crawlSync };
export { isDynamicPattern, escapePath, convertPathToPattern } from '@optiprune/pathx';

function compatibilityOptions(options = {}) {
  const onlyDirectories = options.onlyDirectories ?? false;
  return {
    ...options,
    absolute: options.absolute ?? false,
    onlyFiles: options.onlyFiles ?? (onlyDirectories ? false : true),
    onlyDirectories,
    dot: options.dot ?? false,
    followSymbolicLinks: options.followSymbolicLinks ?? options.followSymlinks ?? true,
    deep: options.deep != null ? options.deep + 1 : options.maxDepth,
  };
}

function hasMagic(pattern) {
  return /[*?{}()[\]]/.test(pattern);
}

function expandDirectoryPatterns(patterns, options) {
  if (options.expandDirectories === false) return patterns;
  const cwd = options.cwd instanceof URL ? fileURLToPath(options.cwd) : (options.cwd ?? process.cwd());
  return patterns.map(pattern => {
    if (typeof pattern !== 'string' || pattern.startsWith('!') || hasMagic(pattern)) return pattern;
    if (!options.cwd && (pattern.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pattern))) return pattern;
    const target = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
    try {
      return statSync(resolve(cwd, target)).isDirectory() ? `${target}/**` : pattern;
    } catch {
      return pattern;
    }
  });
}

function normalizePatterns(patterns, options) {
  const isArray = Array.isArray(patterns);
  const list = isArray ? [...patterns] : [patterns];
  const normalized = expandDirectoryPatterns(list, options);
  return isArray ? normalized : normalized[0];
}

function formatResults(results, options) {
  const cwd = resolve(options.cwd ?? process.cwd()).replace(/\/$/, '');
  return results.map(value => {
    const absolutePath = value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)
      ? value
      : resolve(cwd, value);
    const sameCasePrefix = absolutePath.startsWith(`${cwd}/`);
    const windowsPrefix = /^[A-Za-z]:\//.test(cwd) &&
      absolutePath.slice(0, cwd.length).toLowerCase() === cwd.toLowerCase() &&
      absolutePath[cwd.length] === '/';
    const path = options.absolute || !(sameCasePrefix || windowsPrefix)
      ? absolutePath
      : absolutePath.slice(cwd.length + 1);
    if (options.onlyFiles !== false && !options.onlyDirectories) return path;
    if (options.onlyDirectories) return path.endsWith('/') ? path : `${path}/`;
    try {
      return statSync(absolutePath).isDirectory() && !path.endsWith('/') ? `${path}/` : path;
    } catch {
      return path;
    }
  }).sort();
}

export async function glob(patterns, options = {}) {
  if (patterns && typeof patterns === 'object' && !Array.isArray(patterns)) {
    options = patterns;
    patterns = options.patterns ?? '**/*';
  }
  const opts = compatibilityOptions(options);
  const normalized = normalizePatterns(patterns, opts);
  const crawlInput = Array.isArray(normalized) && normalized.length === 1
    ? normalized[0]
    : normalized;
  return formatResults(await crawlAll(crawlInput, { ...opts, absolute: true }), opts);
}

export function globSync(patterns, options = {}) {
  if (patterns && typeof patterns === 'object' && !Array.isArray(patterns)) {
    options = patterns;
    patterns = options.patterns ?? '**/*';
  }
  const opts = compatibilityOptions(options);
  const normalized = normalizePatterns(patterns, opts);
  const cwdPath = opts.cwd instanceof URL ? fileURLToPath(opts.cwd) : (opts.cwd ?? process.cwd());
  const patternList = Array.isArray(normalized) ? normalized : [normalized];
  const isPattern =
    Array.isArray(normalized) ||
    opts.cwd ||
    patternList.some(hasMagic) ||
    patternList.some(pattern => pattern.startsWith('!')) ||
    opts.ignore;

  if (!isPattern) {
    const singleTarget = typeof normalized === 'string' ? normalized : normalized[0];
    return formatResults([...crawlSync(singleTarget, {
      ...opts,
      absolute: true,
      filesOnly: opts.onlyFiles,
      dirsOnly: opts.onlyDirectories,
      includeHidden: opts.dot,
    })], opts);
  }

  const cwd = resolve(cwdPath);
  const cwdPrefix = cwd.endsWith('/') ? cwd : `${cwd}/`;
  const matcher = compilePatternSet(patternList, opts.ignore ?? []);
  const crawlRoot =
    matcher.staticPrefix.length && !matcher.hasStatics
      ? resolve(cwd, ...matcher.staticPrefix)
      : cwd;
  const result = [];
  for (const path of crawlSync(crawlRoot, {
    ...opts,
    absolute: true,
    filesOnly: opts.onlyFiles,
    dirsOnly: opts.onlyDirectories,
    includeHidden: opts.dot,
    filter: (path, entry, depth) => {
      if (opts.filter && opts.filter(path, entry, depth) === false) return false;
      const relativePath = path.startsWith(cwdPrefix) ? path.slice(cwdPrefix.length) : path;
      const matches =
        matcher.leaf && entry.isFile() && !matcher.hasNegatives
          ? matcher.leaf(entry.name)
          : matcher.test(relativePath);
      return matches && (!matcher.ignored || !matcher.ignored(relativePath));
    },
  })) {
    result.push(path);
  }
  return formatResults(result, opts);
}

export default glob;
