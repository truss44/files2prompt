import { fnmatch, addLineNumbers } from '../src/utils';

describe('utils.fnmatch', () => {
  test('matches simple wildcard *', () => {
    expect(fnmatch('file.txt', '*.txt')).toBe(true);
    expect(fnmatch('file.txt', '*.md')).toBe(false);
  });

  test('matches single char ?', () => {
    expect(fnmatch('a.js', '?.js')).toBe(true);
    expect(fnmatch('ab.js', '?.js')).toBe(false);
  });

  test('exact match with no wildcards', () => {
    expect(fnmatch('README.md', 'README.md')).toBe(true);
    expect(fnmatch('readme.md', 'README.md')).toBe(false);
  });
});

describe('utils.addLineNumbers', () => {
  test('adds numbers with minimal padding for single line', () => {
    const out = addLineNumbers('hello');
    expect(out).toBe('1  hello');
  });

  test('adds proper left padding for multiple lines', () => {
    const out = addLineNumbers(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n'));
    const lines = out.split('\n');
    expect(lines[0]).toBe(' 1  a');
    expect(lines[9]).toBe('10  j');
  });
});
