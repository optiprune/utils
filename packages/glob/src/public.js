import { crawl, crawlAll, crawlSync } from './index.js';

export { crawl, crawlAll, crawlSync };

export const glob = crawlAll;
export const globSync = (patterns, options = {}) => {
  const pattern = Array.isArray(patterns) ? patterns[0] : patterns;
  return [...crawlSync(pattern, options)];
};

export default glob;
