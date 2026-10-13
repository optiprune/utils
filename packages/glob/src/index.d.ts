import type { Dirent } from 'node:fs';

export type ErrorHandler = 'throw' | 'ignore' | ((error: Error, path: string) => boolean | void);

export interface CrawlOptions {
  filesOnly?: boolean;
  dirsOnly?: boolean;
  onlyFiles?: boolean;
  onlyDirectories?: boolean;
  includeHidden?: boolean;
  dot?: boolean;
  followSymlinks?: boolean;
  followSymbolicLinks?: boolean;
  maxDepth?: number;
  deep?: number;
  absolute?: boolean;
  signal?: AbortSignal;
  filter?: (path: string, entry: Dirent, depth: number) => boolean | void;
  onError?: ErrorHandler;
}

export interface GlobOptions extends CrawlOptions {
  cwd?: string | URL;
  ignore?: string | readonly string[];
  dot?: boolean;
  expandDirectories?: boolean;
  braceExpansion?: boolean;
  caseSensitiveMatch?: boolean;
  debug?: boolean;
  extglob?: boolean;
  globstar?: boolean;
  fs?: {
    readdir?: typeof import('node:fs').readdir;
    readdirSync?: typeof import('node:fs').readdirSync;
    realpath?: typeof import('node:fs').realpath;
    realpathSync?: typeof import('node:fs').realpathSync;
    stat?: typeof import('node:fs').stat;
    statSync?: typeof import('node:fs').statSync;
  };
  patterns?: GlobPattern;
}

export type GlobPattern = string | readonly string[];

/** Collects all matching files/paths asynchronously into an array. */
export declare function crawlAll(input: GlobPattern, options?: GlobOptions): Promise<string[]>;

/** Async generator for streaming filesystem crawling with backpressure. */
export declare function crawl(
  input: string,
  options?: CrawlOptions,
): AsyncGenerator<string, void, unknown>;

/** Synchronous generator for streaming filesystem crawling. */
export declare function crawlSync(
  input: string,
  options?: CrawlOptions,
): Generator<string, void, unknown>;

export declare function glob(
  patterns: GlobPattern,
  options?: Omit<GlobOptions, 'patterns'>,
): Promise<string[]>;

/** @deprecated Pass patterns as the first argument. */
export declare function glob(options: GlobOptions): Promise<string[]>;

export declare function globSync(
  patterns: GlobPattern,
  options?: Omit<GlobOptions, 'patterns'>,
): string[];

/** @deprecated Pass patterns as the first argument. */
export declare function globSync(options: GlobOptions): string[];

export declare function isDynamicPattern(pattern: string): boolean;
export declare function escapePath(path: string): string;
export declare function convertPathToPattern(path: string): string;

export default glob;
