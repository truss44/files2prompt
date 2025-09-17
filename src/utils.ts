import * as fs from 'fs';
import * as path from 'path';

// Language mapping for Markdown
export const EXT_TO_LANG: Record<string, string> = {
  py: 'python',
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  js: 'javascript',
  ts: 'typescript',
  html: 'html',
  css: 'css',
  xml: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  rb: 'ruby',
  md: 'markdown',
  txt: 'text',
  csv: 'csv',
  jsonl: 'jsonl',
  pl: 'perl',
};

// Default patterns to always ignore
export const DEFAULT_IGNORES: string[] = ['.env', '.env.*', '.env*', '.gitignore'];

// Common binary file extensions to skip (images, video, audio, archives, fonts, executables, etc.)
export const BINARY_EXTENSIONS: Set<string> = new Set([
  // Images
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico', 'tif', 'tiff', 'psd', 'svg', 'heic', 'heif', 'avif',
  // Video
  'mp4', 'm4v', 'mov', 'avi', 'wmv', 'mkv', 'flv', 'webm', '3gp', '3g2',
  // Audio
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'mid', 'midi',
  // Documents and PDFs
  'pdf',
  // Archives and disk images
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'iso', 'dmg', 'tgz', 'tbz2', 'txz',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // Binaries / libraries / objects
  'exe', 'dll', 'so', 'o', 'a', 'bin', 'dat', 'class', 'jar', 'wasm',
  // Databases
  'sqlite', 'db', 'realm',
]);

// Heuristic to detect if a buffer is likely binary.
function isBinaryBuffer(buf: Buffer): boolean {
  const len = Math.min(buf.length, 512);
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    const c = buf[i];
    if (c === 0) return true; // NUL byte => binary
    // Count non-text/control characters (allow common whitespace and LF/CR/TAB)
    if (c < 7 || (c > 13 && c < 32) || c > 127) {
      suspicious++;
      if (suspicious / len > 0.3) return true;
    }
  }
  return false;
}

// Determine whether a file is binary via extension and a small content sniff.
export function isBinaryFile(fullPath: string): boolean {
  const ext = path.extname(fullPath).slice(1).toLowerCase();
  if (ext && BINARY_EXTENSIONS.has(ext)) return true;
  try {
    const fd = fs.openSync(fullPath, 'r');
    try {
      const buf = Buffer.alloc(512);
      const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
      return isBinaryBuffer(buf.subarray(0, bytesRead));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // If we can't read, don't classify as binary here; let caller handle errors
    return false;
  }
}

// Simple fnmatch implementation (case-sensitive, supports * and ?)
export function fnmatch(name: string, pattern: string): boolean {
  // Escape all regex chars EXCEPT '*' and '?' which we translate to wildcards
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  const regex = new RegExp(regexStr);
  return regex.test(name);
}

// Check if path should be ignored based on rules (matching basename)
export function shouldIgnore(fullPath: string, rules: string[]): boolean {
  const basename = path.basename(fullPath);
  const stats = fs.existsSync(fullPath) ? fs.statSync(fullPath) : null;
  const isDir = stats?.isDirectory() ?? false;
  for (const rule of rules) {
    if (fnmatch(basename, rule) || (isDir && fnmatch(basename + '/', rule))) {
      return true;
    }
  }
  return false;
}

// Read .gitignore from directory
export function readGitignore(dir: string): string[] {
  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    } catch {
      return [];
    }
  }
  return [];
}

// Add line numbers with padding
export function addLineNumbers(content: string): string {
  const lines = content.split('\n');
  if (lines.length === 0) return '';
  const numLines = lines.length;
  const padding = String(numLines).length;
  const numberedLines = lines.map((line, i) => {
    const num = (i + 1).toString().padStart(padding, ' ');
    return `${num}  ${line}`;
  });
  return numberedLines.join('\n');
}

// Write multi-line content using the writer (splits on \n and writes each line)
export function writeMultiLine(writer: (line: string) => void, content: string): void {
  content.split('\n').forEach((line) => writer(line));
}

// Read paths from stdin
export function readPathsFromStdin(useNull: boolean): string[] {
  if (process.stdin.isTTY) {
    return [];
  }
  const data = fs.readFileSync(0, 'utf8'); // Read from stdin (fd 0)
  if (useNull) {
    return data.split('\0').filter((p) => p.trim());
  } else {
    return data.trim().split(/\s+/).filter((p) => p.trim());
  }
}
