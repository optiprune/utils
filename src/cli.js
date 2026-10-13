#!/usr/bin/env node
import { crawl } from './crawl.js';
const root = process.argv[2] || '.';
for await (const path of crawl(root, { includeHidden: process.argv.includes('--hidden') })) console.log(path);
