# optiprune / fast-path-crawler

A **zero-dependency**, iterative filesystem crawler for Node.js. The release workspace contains `@optiprune/pathx` for path primitives and `@optiprune/glob` for the crawler. It uses `Dirent`s to avoid an extra `stat` for ordinary entries, an explicit stack for deep trees, and does not follow symlinks by default.

```js
import { crawl, crawlAll, crawlSync } from 'fast-path-crawler';
for await (const file of crawl('src', {
  filesOnly: true,
  includeHidden: false,
  maxDepth: 10,
  filter: p => p.endsWith('.js'),
}))
  console.log(file);
```

Options: `filesOnly`, `dirsOnly`, `includeHidden`, `followSymlinks`, `maxDepth`, `absolute`, `signal`, `filter`, and `onError` (`throw`, `ignore`, or `(error, path) => false`). `crawlSync` is a sync generator; `crawlAll` collects results. Path helpers accept Windows separators and output `/` paths.

`crawlAll()` also accepts a raw glob directly, matching internally without a caller filter: `crawlAll('**/*.{js,ts,json}', { cwd: 'src', absolute: true })`. Positive and negative sets are supported, for example `crawlAll(['**/*.ts', '!**/*.d.ts'], { cwd })`, as well as `ignore: ['**/node_modules/**']`; ignored directories are pruned before scheduling. Its dependency-free matcher supports braces, `**`, `*`, `?`, and character classes. It uses segment-state matching at arbitrary depth, extracts literal static prefixes to prune the crawl root, and uses direct leaf suffix checks when safe. Directory reads are bounded to 32 active operations, avoiding `EMFILE` from unbounded `Promise.all`; `crawl()` keeps streaming/backpressure behavior and the full edge-case policy set. Run `npm test`, `npm run bench`, `node bench/compare.js > benchmark-results.json`, or `node src/cli.js .`.

These Dependencies are part of the OptiPrune's ecosystem