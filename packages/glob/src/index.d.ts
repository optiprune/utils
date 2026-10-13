import type { Dirent } from 'node:fs';

export type ErrorHandler = 'throw' | 'ignore' | ((error: Error, path: string) => boolean | void);

export interface CrawlOptions {
  filesOnly?: boolean;
  dirsOnly?: boolean;
  includeHidden?: boolean;
  followSymlinks?: boolean;
  maxDepth?: number;
  absolute?: boolean;
  signal?: AbortSignal;
  filter?: (path: string, entry: Dirent, depth: number) => boolean | void;
  onError?: ErrorHandler;
}

export interface GlobOptions extends CrawlOptions {
  cwd?: string;
  ignore?: string | string[];
  dot?: boolean;
  onlyFiles?: boolean;
  onlyDirectories?: boolean;
}

export type GlobPattern = string | string[];

/** Collects all matching files/paths asynchronously into an array. */
export declare function crawlAll(input: GlobPattern, options?: GlobOptions): Promise<string[]>;

/** Async generator for streaming filesystem crawling with backpressure. */
export declare function crawl(input: string, options?: CrawlOptions): AsyncGenerator<string, void, unknown>;

/** Synchronous generator for streaming filesystem crawling. */
export declare function crawlSync(input: string, options?: CrawlOptions): Generator<string, void, unknown>;

/** Primary glob entrypoint (alias of crawlAll). */
export declare const glob: typeof crawlAll;

/** Synchronous glob entrypoint. */
export declare function globSync(patterns: GlobPattern, options?: GlobOptions): string[];

export default glob;