import { describe, expect, it } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crawlAll, globSync, isDynamicPattern, escapePath, convertPathToPattern } from '../packages/glob/src/public.js';
import { createFixture } from './fixtures/filesystem.js';

describe('checklist compatibility', () => {
  it('supports negated character classes', async () => {
    const { root, cleanup } = await createFixture();
    try {
      const result = await crawlAll('src/[!z]*.js', { cwd: root, absolute: false });
      expect(result.sort()).toEqual(['src/index.js', 'src/index.test.js']);
    } finally {
      await cleanup();
    }
  });

  it('supports URL cwd and canonical option aliases', async () => {
    const { root, cleanup } = await createFixture();
    try {
      const cwd = pathToFileURL(root);
      expect((await crawlAll('src/*.js', { cwd, onlyFiles: true, dot: false, absolute: false })).sort()).toEqual([
        'src/index.js',
        'src/index.test.js',
      ]);
      expect(globSync('src/*.js', { cwd, onlyFiles: true, absolute: false }).sort()).toEqual([
        'src/index.js',
        'src/index.test.js',
      ]);
      expect(fileURLToPath(cwd)).toBe(root);
    } finally {
      await cleanup();
    }
  });

  it('exports path utility shims', () => {
    expect(isDynamicPattern('src/*.js')).toBe(true);
    expect(isDynamicPattern('src/@(foo|bar).js')).toBe(true);
    expect(isDynamicPattern('src/index.js')).toBe(false);
    expect(escapePath('src/[x].js')).toBe('src/\\[x\\].js');
    expect(convertPathToPattern('src\\nested\\file.js')).toBe('src/nested/file.js');
  });
});
