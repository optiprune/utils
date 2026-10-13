<p align="center">
  <img src="https://raw.githubusercontent.com/optiprune/utils/refs/heads/main/assets/animation.svg" alt="OptiPrune" width="520">
</p>

<p align="center">
  <strong>Fast, focused filesystem utilities for Node.js.</strong><br>
  Iterative traversal, glob-aware search, and cross-platform path helpers — with no runtime dependencies.
</p>

# @optiprune/pathx

Small, dependency-free path primitives for Node.js. Supports POSIX and Windows separators and returns normalized `/` paths.

## Installation

```sh
pnpm add @optiprune/pathx
# or: npm install @optiprune/pathx
```

## Usage

```js
import { normalize, isAbsolute, join, resolve } from '@optiprune/pathx';

normalize('src\\lib\\..\\index.js'); // 'src/index.js'
isAbsolute('/tmp/data'); // true
join('src', 'lib', 'file.js'); // 'src/lib/file.js'
resolve('src', 'index.js'); // absolute path from the working directory
```

## API

- `normalize(path)` — normalizes separators, `.` and `..` segments.
- `isAbsolute(path)` — detects POSIX, UNC, and Windows drive paths.
- `join(...paths)` — joins and normalizes path segments.
- `resolve(...paths)` — resolves segments relative to the current working directory.

## License

[MIT](LICENSE)
