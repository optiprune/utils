import { crawl, crawlAll, crawlSync, compilePatternSet } from './index.js';
import { resolve } from '@optiprune/pathx';

export { crawl, crawlAll, crawlSync };

export const glob = crawlAll;
export const globSync = (patterns, options = {}) => {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  const isPattern =
    Array.isArray(patterns) ||
    options.cwd ||
    patternList.some(pattern => /[*?{}\[\]]/.test(pattern)) ||
    patternList.some(pattern => pattern.startsWith('!')) ||
    options.ignore;
  const onlyDirectories = options.onlyDirectories ?? options.dirsOnly ?? false;
  const filesOnly = onlyDirectories ? false : (options.onlyFiles ?? options.filesOnly ?? true);
  const includeHidden = options.includeHidden ?? options.dot ?? false;
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
  const cwd = resolve(options.cwd ?? process.cwd());
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
