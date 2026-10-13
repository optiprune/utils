import { describe, expect, it } from 'vitest';
import { isAbsolute, join, normalize, resolve } from '../packages/pathx/src/index.js';

const cases = [
  ['POSIX separators and dot segments', 'a//./b/../c', 'a/c'],
  ['mixed separators', 'a\\b/./c', 'a/b/c'],
  ['absolute root cannot traverse above root', '/a/../../b', '/b'],
  ['relative traversal is preserved', '../a/../../b', '../../b'],
  ['Windows drive absolute path', 'C:\\Users\\alice\\..\\tmp', 'C:/Users/tmp'],
  ['Windows drive-relative path', 'C:foo\\bar', 'C:foo/bar'],
  ['UNC path', '\\\\server\\share\\folder\\..\\file', '//server/share/file'],
];

describe('@optiprune/pathx', () => {
  it.each(cases)('normalizes %s', (_label, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('handles empty, current-directory, and drive-only paths', () => {
    expect(normalize('')).toBe('.');
    expect(normalize('.')).toBe('.');
    expect(normalize('C:')).toBe('C:.');
    expect(normalize('/')).toBe('/');
    expect(normalize('C:/')).toBe('C:/');
  });

  it('does not mutate the input and supports long paths beyond the initial buffer', () => {
    const input = Array.from({ length: 180 }, (_, i) => `segment-${i}`).join('/');
    expect(normalize(input)).toBe(input);
    expect(input).toContain('segment-0');
  });

  it('identifies POSIX, UNC, drive-absolute, and drive-relative paths correctly', () => {
    expect(isAbsolute('/tmp/file')).toBe(true);
    expect(isAbsolute('\\\\server\\share')).toBe(true);
    expect(isAbsolute('C:\\tmp')).toBe(true);
    expect(isAbsolute('C:tmp')).toBe(false);
    expect(isAbsolute('relative/file')).toBe(false);
    expect(isAbsolute(null)).toBe(false);
  });

  it('joins and resolves while accepting empty path segments', () => {
    expect(join('a', '', 'b/../c')).toBe('a/c');
    expect(join('', '')).toBe('.');
    expect(resolve('/tmp', 'a', '..', 'file')).toBe('/tmp/file');
    expect(resolve('')).toBe(normalize(process.cwd()));
  });

  it('rejects non-string input for normalize', () => {
    expect(() => normalize(42)).toThrowError(TypeError);
  });
});
