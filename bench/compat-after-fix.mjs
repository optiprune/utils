import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';
import { glob as microglob } from '../packages/glob/src/public.js';
import { glob as tinyglobby } from 'tinyglobby';

const isTable = process.argv.includes('--table');

const profiles = [
  {
    name: 'shallow-wide',
    description: '4 directories × 500 files',
    dirs: 4,
    filesPerDir: 500,
    depth: 1,
  },
  {
    name: 'many-directories',
    description: '100 nested directories × 100 files',
    dirs: 100,
    filesPerDir: 100,
    depth: 2,
  },
  {
    name: 'deep-tree',
    description: '8 chains × 20 levels × 20 leaf files',
    dirs: 8,
    filesPerDir: 20,
    depth: 20,
  },
  {
    name: 'mixed-project',
    description: 'source, tests, declarations, hidden files and symlink',
    dirs: 20,
    filesPerDir: 50,
    depth: 3,
    mixed: true,
  },
];

const digest = values =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify([...values].sort()))
    .digest('hex')
    .slice(0, 16);
const normalize = values => values.map(value => value.replaceAll('\\', '/').replace(/\/$/, ''));
const summary = values => ({
  minMs: Math.min(...values),
  maxMs: Math.max(...values),
  avgMs: values.reduce((sum, value) => sum + value, 0) / values.length,
});

async function createFixture(profile) {
  const root = await mkdtemp(join(tmpdir(), `microglob-${profile.name}-`));
  for (let d = 0; d < profile.dirs; d++) {
    let dir = join(root, `dir-${String(d).padStart(3, '0')}`);
    for (let level = 1; level < profile.depth; level++) dir = join(dir, `level-${level}`);
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < profile.filesPerDir; i++) {
      let ext =
        i % 10 === 0
          ? 'json'
          : i % 10 === 1
            ? 'd.ts'
            : i % 10 === 2
              ? 'test.js'
              : i % 3 === 0
                ? 'ts'
                : 'js';
      if (profile.mixed && i % 17 === 0) ext = 'md';
      await writeFile(
        join(dir, `file-${String(i).padStart(4, '0')}.${ext}`),
        `${profile.name}:${d}:${i}\n`,
      );
    }
  }
  await mkdir(join(root, '.config'), { recursive: true });
  await writeFile(join(root, '.config', 'secret.json'), 'hidden\n');
  if (profile.mixed) {
    await mkdir(join(root, 'docs', 'guide'), { recursive: true });
    await writeFile(join(root, 'docs', 'guide', 'readme.md'), 'docs\n');
    await symlink(join(root, 'dir-000'), join(root, 'linked-src'));
  }
  return root;
}

function casesFor(profile) {
  const target = profile.depth > 1 ? `dir-000/**/*.ts` : 'dir-000/**/*.ts';
  return [
    ['recursive-extensions', '**/*.{js,ts,json}', { followSymbolicLinks: false }],
    [
      'negation',
      ['**/*.{js,ts,json}', '!**/*.test.js', '!**/*.d.ts'],
      { followSymbolicLinks: false },
    ],
    ['targeted-subtree', target, { followSymbolicLinks: false }],
    ['hidden-files', '**/*.json', { dot: true, followSymbolicLinks: false }],
    ['directories-only', '**', { onlyDirectories: true, followSymbolicLinks: false }],
    ['directory-expansion', 'dir-000', { followSymbolicLinks: false }],
    ['depth-limit', '**/*', { deep: 2, followSymbolicLinks: false }],
  ];
}

async function measurePair(microFn, tinyFn) {
  for (let i = 0; i < 3; i++) {
    await microFn();
    await tinyFn();
  }
  const microTimes = [],
    tinyTimes = [];
  let microResult, tinyResult;
  for (let i = 0; i < 10; i++) {
    let start = performance.now();
    microResult = await microFn();
    microTimes.push(performance.now() - start);
    start = performance.now();
    tinyResult = await tinyFn();
    tinyTimes.push(performance.now() - start);
  }
  const pack = (times, result) => ({
    ...summary(times),
    count: result.length,
    digest: digest(normalize(result)),
  });
  return { microglob: pack(microTimes, microResult), tinyglobby: pack(tinyTimes, tinyResult) };
}

const allResults = [];
for (const profile of profiles) {
  const root = await createFixture(profile);
  try {
    for (const [name, pattern, options] of casesFor(profile)) {
      const measured = await measurePair(
        () => microglob(pattern, { cwd: root, ...options }),
        () => tinyglobby(pattern, { cwd: root, ...options }),
      );
      allResults.push({
        profile: profile.name,
        profileDescription: profile.description,
        case: name,
        microglob: measured.microglob,
        tinyglobby: measured.tinyglobby,
        parity:
          measured.microglob.count === measured.tinyglobby.count &&
          measured.microglob.digest === measured.tinyglobby.digest,
        ratioAvg: measured.microglob.avgMs / measured.tinyglobby.avgMs,
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (isTable) {
  console.log(`\nNode: ${process.version} | 3 warmups, 10 measured runs\n`);
  console.table(
    allResults.map(r => ({
      Profile: r.profile,
      Case: r.case,
      Count: r.microglob.count,
      Parity: r.parity ? 'MATCH' : 'MISMATCH',
      'microglob (avg)': `${r.microglob.avgMs.toFixed(3)} ms`,
      'tinyglobby (avg)': `${r.tinyglobby.avgMs.toFixed(3)} ms`,
      Ratio: `${r.ratioAvg.toFixed(2)}x`,
    })),
  );
} else {
  console.log(
    JSON.stringify(
      {
        node: process.version,
        profiles: profiles.map(({ name, description }) => ({ name, description })),
        warmups: 3,
        measuredRuns: 10,
        results: allResults,
      },
      null,
      2,
    ),
  );
}
