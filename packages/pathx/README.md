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
