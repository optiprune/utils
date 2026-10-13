# Benchmarks

`pnpm bench` creates a temporary, deterministic filesystem fixture with 50 nested directories and 10,000 files, then runs five crawl measurements. `pnpm bench:compare` compares the in-repository crawler with `fast-glob`, `tinyglobby`, and `node:glob`.

The comparison checks both elapsed time and resident memory. Every engine must return the same count and SHA-256 output digest; wall-clock performance is reported but not asserted because hosted runners are shared machines.

```sh
ITERATIONS=5 pnpm bench:compare > benchmark-results.json
```

The release README records one sample run with the machine and Node.js version so the numbers remain interpretable. Re-run the command for a fresh measurement rather than treating the checked-in values as a guarantee across hardware or workloads.
