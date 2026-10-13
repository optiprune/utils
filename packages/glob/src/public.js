import { crawl, crawlAll, crawlSync, compilePatternSet } from './index.js';
import { resolve } from '@optiprune/pathx';
import { fileURLToPath } from 'node:url';

export { crawl, crawlAll, crawlSync };
export { isDynamicPattern, escapePath, convertPathToPattern } from '@optiprune/pathx';

export const glob = crawlAll;
export const globSync = (patterns, options = {}) => {
  const cwdPath =
    options.cwd instanceof URL ? fileURLToPath(options.cwd) : (options.cwd ?? process.cwd());
  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  const isPattern =
    Array.isArray(patterns) ||
    options.cwd ||
    patternList.some(pattern => /[*?{}\[\]]/.test(pattern)) ||
    patternList.some(pattern => pattern.startsWith('!')) ||
    options.ignore;
  const onlyDirectories = options.onlyDirectories ?? options.dirsOnly ?? false;
  const filesOnly = options.onlyFiles ?? (onlyDirectories ? false : (options.filesOnly ?? true));
  const includeHidden = options.dot ?? options.includeHidden ?? false;
  if (!isPattern) {
    const singleTarget = typeof patterns === 'string' ? patterns : patterns[0];
    return [
      ...crawlSync(singleTarget, {
        ...options,
        filesOnly,
        dirsOnly: onlyDirectories,
        includeHidden,
      }),
    ];
  }
  const cwd = resolve(cwdPath);
  const cwdPrefix = cwd.endsWith('/') ? cwd : `${cwd}/`;
  const matcher = compilePatternSet(patternList, options.ignore ?? []);
  const result = [];
  for (const path of crawlSync(cwd, {
    ...options,
    filesOnly,
    dirsOnly: onlyDirectories,
    includeHidden,
    filter: (path, entry, depth) => {
      if (options.filter && options.filter(path, entry, depth) === false) return false;
      const relativePath = path.startsWith(cwdPrefix) ? path.slice(cwdPrefix.length) : path;
      return matcher.test(relativePath) && (!matcher.ignored || !matcher.ignored(relativePath));
    },
  })) {
    result.push(
      options.absolute === false && path.startsWith(cwdPrefix)
        ? path.slice(cwdPrefix.length)
        : path,
    );
  }
  return result;
};

export default glob;
