import process from 'node:process';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { crawlAll } from '../src/index.js';
import fg from 'fast-glob';
import { glob as tinyGlob } from 'tinyglobby';
import { glob as nodeGlob } from 'glob';

const [engine, pattern, cwd, iterationsText] = process.argv.slice(2);
const iterations = Number(iterationsText || 5);
const runners = {
  'fast-path-crawler': async () => crawlAll(pattern, { cwd, absolute: true, includeHidden: false }),
  'fast-glob': async () => fg(pattern, { cwd, absolute: true, onlyFiles: true, dot: false }),
  tinyglobby: async () => tinyGlob(pattern, { cwd, absolute: true, onlyFiles: true, dot: false }),
  'node:glob': async () => nodeGlob(pattern, { cwd, absolute: true, nodir: true, dot: false }),
};

const run = runners[engine];
if (!run) throw new Error(`Unknown engine: ${engine}`);
const samples = [];
const sample = () => samples.push(process.memoryUsage().rss);
const timer = setInterval(sample, 2);
sample();
let output = [];
for (let i = 0; i < iterations + 1; i++) {
  const start = performance.now();
  output = await run();
  const elapsed = performance.now() - start;
  if (i > 0)
    process.stdout.write(
      JSON.stringify({ iteration: i, ms: elapsed, count: output.length }) + '\n',
    );
  sample();
}
clearInterval(timer);
sample();
const avgRss = samples.reduce((a, b) => a + b, 0) / samples.length;
const digest = createHash('sha256')
  .update(JSON.stringify(output.map(p => relative(cwd, p)).sort()))
  .digest('hex');
process.stderr.write(
  JSON.stringify({
    engine,
    averageRssBytes: Math.round(avgRss),
    peakRssBytes: Math.max(...samples),
    samples: samples.length,
    outputCount: output.length,
    outputDigest: digest,
  }) + '\n',
);
