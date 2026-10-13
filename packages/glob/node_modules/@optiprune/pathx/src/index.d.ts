/**
 * Normalizes the given path, resolving `.` and `..` segments,
 * stripping redundant slashes, and converting all separators to POSIX `/`.
 */
export declare function normalize(path: string): string;

/**
 * Determines whether the given path is absolute.
 * Supports POSIX, UNC (`//server/share`), and Windows drive (`C:/`) paths.
 */
export declare function isAbsolute(path: string): boolean;

/**
 * Joins all given path segments together using `/` and normalizes the resulting path.
 */
export declare function join(...paths: string[]): string;

/**
 * Resolves a sequence of paths or path segments into an absolute path
 * relative to the current working directory.
 */
export declare function resolve(...paths: string[]): string;

export declare function isDynamicPattern(pattern: string): boolean;
export declare function escapePath(path: string): string;
export declare function convertPathToPattern(path: string): string;
