<p align="center">
  <img src="https://raw.githubusercontent.com/optiprune/utils/refs/heads/main/assets/animation.svg" alt="OptiPrune" width="520">
</p>

<p align="center">
  <strong>Fast, focused filesystem utilities for Node.js.</strong><br>
  Iterative traversal, glob-aware search, and cross-platform path helpers — with no runtime dependencies.
</p>

# @optiprune/glob

Fast, dependency-light filesystem crawler for Node.js with async and sync iterators and built-in glob matching.

## Installation

```sh
pnpm add @optiprune/glob
# or: npm install @optiprune/glob
```

## Usage

```js
import { glob, globSync, crawlAll, crawl, crawlSync } from '@optiprune/glob';

const matches = await glob('**/*.js', { cwd: 'src' });
const syncMatches = globSync('src');

const files = await crawlAll(['**/*.{js,ts}', '!**/*.d.ts'], {
  cwd: 'src',
  ignore: ['**/node_modules/**'],
  absolute: true,
});

for await (const file of crawl('src', { filesOnly: true, includeHidden: false })) {
  console.log(file);
}

for (const file of crawlSync('src', { filesOnly: true, absolute: false })) {
  console.log(file);
}
```

## Features

- No runtime dependencies
- Explicit stack for deep directory trees
- `Dirent`-based traversal without unnecessary `stat` calls
- Symlinks are followed by default with cycle protection; disable with `followSymlinks: false`
- Glob patterns with `**`, `*`, `?`, braces, character classes, and negation
- `ignore` for pruning entire directories early
- Bounded active directory reads in `crawlAll`

## API

- `crawl(input, options)` — async generator for streaming and backpressure.
- `crawlSync(input, options)` — synchronous generator.
- `crawlAll(input, options)` — array of all matches; pattern input searches files by default.
- `glob` — alias of `crawlAll`; also the default export.
- `globSync(patterns, options)` — synchronous compatibility alias over `crawlSync`. For an array, the first pattern is used.

Options: `filesOnly`, `dirsOnly`, `includeHidden`, `followSymlinks`, `maxDepth`, `absolute`, `signal`, `filter`, and `onError`. Pattern input can be a string or array, for example `crawlAll('**/*.{js,ts}', { cwd: 'src' })`.

TypeScript declarations are shipped as `src/index.d.ts` and expose `CrawlOptions`, `GlobOptions`, and `GlobPattern`.

See the [project README](../../README.md) for benchmarks and full project context.

## License

[MIT](LICENSE)
