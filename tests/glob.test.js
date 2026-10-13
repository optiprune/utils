import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import glob, { glob as namedGlob, globSync, crawl, crawlAll, crawlSync } from '../packages/glob/src/public.js';
import { createFixture } from './fixtures/filesystem.js';

const relative = (root, paths) =>
  paths.map(path => path.slice(root.length + 1).replaceAll('\\', '/')).sort();

async function withFixture(test) {
  const fixture = await createFixture();
  try {
    await test(fixture);
  } finally {
    await fixture.cleanup();
  }
}

describe('@optiprune/glob', () => {
  it('keeps crawl APIs and exposes glob aliases', async () => {
    await withFixture(async ({ root }) => {
      expect(namedGlob).toBe(crawlAll);
      expect(glob).toBe(crawlAll);
      expect(relative(root, await glob('src/**/*.js', { cwd: root, absolute: true }))).toEqual([
        'src/index.js',
        'src/index.test.js',
      ]);
      expect(relative(root, globSync(root, { filesOnly: true }))).toContain('src/index.js');
      expect(crawl).toBeTypeOf('function');
      expect(crawlSync).toBeTypeOf('function');
    });
  });

  it('crawls asynchronously and synchronously with filtering options', async () => {
    await withFixture(async ({ root }) => {
      const asyncFiles = await crawlAll(root, { filesOnly: true });
      expect(relative(root, asyncFiles)).toEqual([
        '.config/secret.json',
        'docs/guide.txt',
        'docs/readme.md',
        'empty/.keep',
        'src/index.js',
        'src/index.test.js',
        'src/nested/deep.ts',
      ]);

      expect(relative(root, [...crawlSync(root, { dirsOnly: true, followSymlinks: false })])).toEqual([
        '.config',
        'docs',
        'empty',
        'empty/real-directory',
        'src',
        'src/nested',
      ]);

      const filtered = [];
      for await (const path of crawl(root, {
        filesOnly: true,
        includeHidden: false,
        filter: (_path, entry, depth) => entry.name.endsWith('.js') && depth === 2,
      })) filtered.push(path);
      expect(relative(root, filtered)).toEqual(['src/index.js', 'src/index.test.js']);
    });
  });

  it('supports globstar, braces, character classes, questions, negation, and cwd', async () => {
    await withFixture(async ({ root }) => {
      const result = await crawlAll(['src/**/*.{js,ts}', '!src/**/*.test.js'], {
        cwd: root,
        absolute: false,
      });
      expect(result).toEqual([
        'src/index.js',
        'src/nested/deep.ts',
      ]);

      expect(await crawlAll('docs/?????.txt', { cwd: root, absolute: false })).toEqual(['docs/guide.txt']);
      expect(await crawlAll('docs/[gr]*.md', { cwd: root, absolute: false })).toEqual(['docs/readme.md']);
    });
  });

  it('supports array patterns, relative results, and directory options', async () => {
    await withFixture(async ({ root }) => {
      expect(
        (await crawlAll(['src/index.js', 'docs/*.md'], { cwd: root, absolute: false })).sort(),
      ).toEqual(['docs/readme.md', 'src/index.js']);
      expect(
        globSync(['src/index.js', 'docs/*.md'], { cwd: root, absolute: false }).sort(),
      ).toEqual(['docs/readme.md', 'src/index.js']);
      expect(relative(root, globSync(root, { onlyDirectories: true, maxDepth: 1, followSymlinks: false }))).toEqual([
        'docs',
        'empty',
        'src',
      ]);
      expect((await crawlAll('**/*', { cwd: root, onlyDirectories: true, followSymlinks: false, absolute: false })).sort()).toEqual([
        'docs',
        'empty',
        'empty/real-directory',
        'src',
        'src/nested',
      ]);
      expect(await crawlAll('**/*.json', { cwd: root, dot: false, absolute: false })).toEqual([]);
      expect(await crawlAll('**/*.json', { cwd: root, dot: true, absolute: false })).toEqual([
        '.config/secret.json',
      ]);
    });
  });

  it('supports hidden-file policy and maximum depth', async () => {
    await withFixture(async ({ root }) => {
      const visible = await crawlAll(root, { filesOnly: true, includeHidden: false });
      expect(relative(root, visible)).not.toContain('.config/secret.json');
      const shallow = await crawlAll(root, { filesOnly: true, maxDepth: 0 });
      expect(relative(root, shallow)).toEqual([]);
    });
  });

  it('supports bounded numeric and alpha brace ranges without expanding huge ranges', async () => {
    await withFixture(async ({ root, path }) => {
      await mkdir(path('ranges'), { recursive: true });
      await Promise.all([
        writeFile(path('ranges', '03.js'), '03'),
        writeFile(path('ranges', '04.js'), '04'),
        writeFile(path('ranges', '05.js'), '05'),
        writeFile(path('ranges', 'a.txt'), 'a'),
        writeFile(path('ranges', 'c.txt'), 'c'),
        writeFile(path('ranges', 'e.txt'), 'e'),
      ]);
      expect((await crawlAll('ranges/{03..05}.js', { cwd: root, absolute: false })).sort()).toEqual([
        'ranges/03.js',
        'ranges/04.js',
        'ranges/05.js',
      ]);
      expect((await crawlAll('ranges/{a..e..2}.txt', { cwd: root, absolute: false })).sort()).toEqual([
        'ranges/a.txt',
        'ranges/c.txt',
        'ranges/e.txt',
      ]);
      expect((await crawlAll('ranges/{e..a}.txt', { cwd: root, absolute: false })).sort()).toEqual([
        'ranges/a.txt',
        'ranges/c.txt',
        'ranges/e.txt',
      ]);
      expect(await crawlAll('ranges/{1..1001}.js', { cwd: root, absolute: false })).toEqual([]);
      expect(await crawlAll('ranges/{1..z}.js', { cwd: root, absolute: false })).toEqual([]);
    });
  });

  it('matches segment-bounded extglobs and literal brace sets', async () => {
    await withFixture(async ({ root }) => {
      expect((await crawlAll('src/@(index|nested).*', { cwd: root, absolute: false })).sort()).toEqual([
        'src/index.js',
        'src/index.test.js',
      ]);
      expect((await crawlAll('**/+(index|deep).*', { cwd: root, absolute: false })).sort()).toEqual([
        'src/index.js',
        'src/index.test.js',
        'src/nested/deep.ts',
      ]);
      expect(await crawlAll('**/!(index.test.js)', { cwd: root, absolute: false })).toContain(
        'src/index.js',
      );
      expect(await crawlAll('!(index.test.js)', { cwd: root, absolute: false })).toEqual([]);
      expect(await crawlAll('{src,docs}/*.md', { cwd: root, absolute: false })).toEqual([
        'docs/readme.md',
      ]);
      expect(await crawlAll('{src,docs}', { cwd: root, absolute: false })).toEqual([]);
    });
  });

  it('handles missing roots according to onError policy', async () => {
    const missing = '/tmp/optiprune-utils-definitely-missing';
    await expect(crawlAll(missing)).rejects.toThrow();
    expect(await crawlAll(missing, { onError: 'ignore' })).toEqual([]);
    const seen = [];
    expect(await crawlAll(missing, { onError: (_error, path) => { seen.push(path); return false; } })).toEqual([]);
    expect(seen).toHaveLength(1);
  });

  it('supports abort signals and followSymlinks without looping', async () => {
    await withFixture(async ({ root, symlinks }) => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));
      await expect(crawlAll(root, { signal: controller.signal })).rejects.toThrow('cancelled');
      if (symlinks) {
        const result = await crawlAll(root, { followSymlinks: true, filesOnly: true });
        // Demonstrates duplicate-inode/cycle protection: src is traversed
        // first, so linked-src points to an already-seen directory and is
        // intentionally pruned even though symlink traversal is enabled.
        expect(relative(root, result)).toContain('src/index.js');
        expect(relative(root, result)).not.toContain('linked-src/index.js');
      }
    });
  });
});
