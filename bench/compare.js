import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const engines = ['fast-path-crawler', 'fast-glob', 'tinyglobby', 'node:glob'];
const iterations = Number(process.env.ITERATIONS || 5);
const root = await mkdtemp(join(tmpdir(), 'fast-path-compare-'));

async function fixture() {
  for (let d = 0; d < 50; d++) {
    const dir = join(root, `dir-${String(d).padStart(2, '0')}`, 'nested');
    await mkdir(dir, { recursive: true });
    for (let f = 0; f < 200; f++) {
      const ext = f % 10 === 0 ? 'json' : f % 3 === 0 ? 'ts' : 'js';
      await writeFile(join(dir, `file-${String(f).padStart(3, '0')}.${ext}`), `${f}\n`);
    }
  }
  await mkdir(join(root, '.hidden'));
  await writeFile(join(root, '.hidden', 'secret.js'), 'hidden\n');
}
function run(engine) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      [resolve('bench/worker.js'), engine, '**/*.{js,ts,json}', root, String(iterations)],
      { cwd: resolve('.') },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', b => {
      stdout += b;
    });
    child.stderr.on('data', b => {
      stderr += b;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`${engine} exited ${code}: ${stderr}`));
      const runs = stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
      const memory = JSON.parse(stderr.trim().split('\n').at(-1));
      resolveRun({
        engine,
        timeMs: Number((runs.reduce((a, r) => a + r.ms, 0) / runs.length).toFixed(3)),
        maxTimeMs: Number(Math.max(...runs.map(r => r.ms)).toFixed(3)),
        timesMs: runs.map(r => Number(r.ms.toFixed(3))),
        averageRamBytes: memory.averageRssBytes,
        averageRamMB: Number((memory.averageRssBytes / 1048576).toFixed(2)),
        peakRamMB: Number((memory.peakRssBytes / 1048576).toFixed(2)),
        outputCount: memory.outputCount,
        outputDigest: memory.outputDigest,
      });
    });
  });
}
try {
  await fixture();
  const results = [];
  for (const engine of engines) results.push(await run(engine));
  const expected = results[0].outputCount;
  const expectedDigest = results[0].outputDigest;
  const output = {
    input: {
      fixture: '50 nested directories × 200 files',
      totalFiles: 10000,
      pattern: '**/*.{js,ts,json}',
      hiddenFiles: 1,
      iterations,
      warmupIterations: 1,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    output: {
      expectedCount: expected,
      expectedDigest,
      engines: results.map(r => ({
        engine: r.engine,
        count: r.outputCount,
        accurate: r.outputCount === expected && r.outputDigest === expectedDigest,
        outputDigest: r.outputDigest,
        averageRamMB: r.averageRamMB,
        peakRamMB: r.peakRamMB,
        timeMs: r.timeMs,
        maxTimeMs: r.maxTimeMs,
        timesMs: r.timesMs,
      })),
    },
    generatedAt: new Date().toISOString(),
    notes: [
      'Each engine ran in a fresh child process, sequentially, against the same fixture.',
      'timeMs is the mean of post-warmup iterations; maxTimeMs exposes scheduler/GC outliers.',
      'Average RAM is mean sampled resident set size (RSS), not heap usage.',
      'Accuracy requires equal count and an identical SHA-256 digest of the complete sorted relative output path set.',
      'The custom runner passes the raw pattern to crawlAll; its dependency-free segment-state matcher performs the pattern matching internally.',
      'The crawler extracts static literal prefixes and limits concurrent readdir calls to 32.',
      'A hard wall-clock guarantee such as every run <13 ms is impossible on a multitasking OS; use repeated runs and timeMs/maxTimeMs together.',
    ],
  };
  console.log(JSON.stringify(output, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
