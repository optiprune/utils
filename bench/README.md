# Benchmarks

`pnpm bench` creates a temporary, deterministic filesystem fixture with 50 directories and 10,000 files, then runs five crawl measurements. The GitHub Actions benchmark workflow runs it on Node 20 and Node 22.

The benchmark is intentionally separate from the Vitest suite: it reports timing samples but does not make a wall-clock assertion, because hosted runners are shared machines.
