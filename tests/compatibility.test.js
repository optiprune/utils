import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { glob as microglob, globSync as microglobSync } from '../packages/glob/src/public.js';
import { glob as tinyglobby, globSync as tinyglobbySync } from 'tinyglobby';

async function fixture() {
  const rawRoot = await mkdtemp(join(tmpdir(), 'microglob-compat-'));
  const root = rawRoot.replaceAll('\\', '/');
  const files = [
    'src/index.js',
    'src/index.test.js',
    'src/components/Button.tsx',
    'src/components/Button.test.tsx',
    'src/nested/deep.ts',
    'src/nested/deeper/value.json',
    'docs/readme.md',
    'docs/guide.txt',
    'packages/a/index.js',
    'packages/b/index.js',
    '.config/secret.json',
    'empty/.keep',
  ];
  for (const file of files) {
    const path = resolve(root, file);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, file);
  }
  await symlink(resolve(root, 'src'), resolve(root, 'linked-src'));
  return { root, files, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const sorted = result => [...result].sort();

async function compare(patterns, options = {}) {
  const [micro, tiny] = await Promise.all([
    microglob(patterns, options),
    tinyglobby(patterns, options),
  ]);
  expect(sorted(micro)).toEqual(sorted(tiny));
  return { micro: sorted(micro), tiny: sorted(tiny) };
}

describe('tinyglobby compatibility fixtures', () => {
  it('matches common recursive file patterns', async () => {
    const f = await fixture();
    try {
      await compare('**/*.{js,ts,json}', { cwd: f.root, followSymbolicLinks: false });
      await compare('src/**/*.js', { cwd: f.root, followSymbolicLinks: false });
      await compare(['src/**/*.js', '!**/*.test.js'], {
        cwd: f.root,
        followSymbolicLinks: false,
      });
    } finally {
      await f.cleanup();
    }
  });

  it('matches hidden-file and ignore behavior', async () => {
    const f = await fixture();
    try {
      await compare('**/*.json', { cwd: f.root, dot: false, followSymbolicLinks: false });
      await compare('**/*.json', { cwd: f.root, dot: true, followSymbolicLinks: false });
      await compare('**/*', {
        cwd: f.root,
        ignore: ['**/node_modules/**', '**/packages/**'],
        followSymbolicLinks: false,
      });
    } finally {
      await f.cleanup();
    }
  });

  it('matches directory expansion, directory mode, and depth limits', async () => {
    const f = await fixture();
    try {
      await compare('src', { cwd: f.root, followSymbolicLinks: false });
      await compare('**', {
        cwd: f.root,
        onlyDirectories: true,
        followSymbolicLinks: false,
      });
      await compare('**/*', {
        cwd: f.root,
        deep: 2,
        followSymbolicLinks: false,
      });
    } finally {
      await f.cleanup();
    }
  });

  it('matches braces, ranges, character classes, and extglobs', async () => {
    const f = await fixture();
    try {
      await compare('{src,docs}/*.{js,md,txt}', { cwd: f.root, followSymbolicLinks: false });
      await compare('src/@(index|nested)/**', { cwd: f.root, followSymbolicLinks: false });
      await compare('src/[ic]*/*.?(ts|tsx)', { cwd: f.root, followSymbolicLinks: false });
    } finally {
      await f.cleanup();
    }
  });

  it('keeps relative and absolute result formatting in sync', async () => {
    const f = await fixture();
    try {
      const relative = await compare('src/**/*.js', {
        cwd: f.root,
        absolute: false,
        followSymbolicLinks: false,
      });
      const [microAbs, tinyAbs] = await Promise.all([
        microglob('src/**/*.js', { cwd: f.root, absolute: true, followSymbolicLinks: false }),
        tinyglobby('src/**/*.js', { cwd: f.root, absolute: true, followSymbolicLinks: false }),
      ]);
      expect(sorted(microAbs)).toEqual(sorted(tinyAbs));
      expect(relative.micro.every(path => !path.startsWith('/'))).toBe(true);
      expect(microAbs.every(path => path.startsWith(f.root))).toBe(true);
    } finally {
      await f.cleanup();
    }
  });

  it('keeps sync and async results aligned', async () => {
    const f = await fixture();
    try {
      const options = { cwd: f.root, followSymbolicLinks: false };
      expect(sorted(microglobSync('**/*.js', options))).toEqual(
        sorted(tinyglobbySync('**/*.js', options)),
      );
      expect(sorted(microglobSync('**/*.js', options))).toEqual(
        sorted(await microglob('**/*.js', options)),
      );
      expect(microglobSync('src/**/*.js', { ...options, absolute: false })).toEqual([
        'src/index.js',
        'src/index.test.js',
      ].sort());
      expect(microglobSync('src/**/*.js', { ...options, absolute: true })).toEqual([
        `${f.root}/src/index.js`,
        `${f.root}/src/index.test.js`,
      ].sort());
    } finally {
      await f.cleanup();
    }
  });

  it('keeps single-item arrays equivalent to string patterns', async () => {
    const f = await fixture();
    try {
      const options = { cwd: f.root, followSymbolicLinks: false };
      expect(await microglob(['src/**/*.js'], options)).toEqual(
        await microglob('src/**/*.js', options),
      );
      expect(microglobSync('src/index.js', options)).toEqual(['src/index.js']);
      expect(microglobSync('src', { ...options, onlyDirectories: true })).toEqual([
        'src/components/',
        'src/nested/',
        'src/nested/deeper/',
      ]);
    } finally {
      await f.cleanup();
    }
  });

  it('records the remaining intentional symlink-alias difference', async () => {
    const f = await fixture();
    try {
      const [micro, tiny] = await Promise.all([
        microglob('**/index.js', { cwd: f.root, followSymbolicLinks: true }),
        tinyglobby('**/index.js', { cwd: f.root, followSymbolicLinks: true }),
      ]);
      expect(micro).toContain('src/index.js');
      expect(tiny).toContain('linked-src/index.js');
      expect(micro).not.toContain('linked-src/index.js');
    } finally {
      await f.cleanup();
    }
  });
});
