#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import ignore from 'ignore';

// Language mapping for Markdown
const EXT_TO_LANG: Record<string, string> = {
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
};

// Default patterns to always ignore
const DEFAULT_IGNORES: string[] = ['.env', '.env.*', '.env*', '.gitignore'];

// Global index for XML documents
let globalIndex = 1;

// Simple fnmatch implementation (case-sensitive, supports * and ?)
function fnmatch(name: string, pattern: string): boolean {
  const regexStr = '^' + pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$';
  const regex = new RegExp(regexStr);
  return regex.test(name);
}

// Check if path should be ignored based on rules (matching basename)
function shouldIgnore(fullPath: string, rules: string[]): boolean {
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
function readGitignore(dir: string): string[] {
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
function addLineNumbers(content: string): string {
  const lines = content.split('\n');
  if (lines.length === 0) return '';
  const numLines = lines.length;
  const padding = Math.ceil(Math.log10(numLines));
  const numberedLines = lines.map((line, i) => {
    const num = (i + 1).toString().padStart(padding, ' ');
    return `${num}  ${line}`;
  });
  return numberedLines.join('\n');
}

// Write multi-line content using the writer (splits on \n and writes each line)
function writeMultiLine(writer: (line: string) => void, content: string): void {
  content.split('\n').forEach((line) => writer(line));
}

// Print path in default format
function printDefault(writer: (line: string) => void, filePath: string, content: string, lineNumbers: boolean): void {
  writer(filePath);
  writer('---');
  if (lineNumbers) {
    content = addLineNumbers(content);
  }
  writeMultiLine(writer, content);
  writer('');
  writer('---');
}

// Print path in XML format (optimized for LLM/Claude: simple tags, indexed documents)
function printAsXml(writer: (line: string) => void, filePath: string, content: string, lineNumbers: boolean): void {
  writer(`<document index="${globalIndex}">`);
  writer(`<source>${filePath}</source>`);
  writer('<document_content>');
  if (lineNumbers) {
    content = addLineNumbers(content);
  }
  writeMultiLine(writer, content);
  writer('</document_content>');
  writer('</document>');
  globalIndex++;
}

// Print path in Markdown format
function printAsMarkdown(writer: (line: string) => void, filePath: string, content: string, lineNumbers: boolean): void {
  writer(filePath);
  const ext = path.extname(filePath).substring(1).toLowerCase();
  const lang = EXT_TO_LANG[ext] || '';
  let backticks = '```';
  while (content.includes(backticks)) {
    backticks += '`';
  }
  writer(`${backticks}${lang}`);
  if (lineNumbers) {
    content = addLineNumbers(content);
  }
  writeMultiLine(writer, content);
  writer(backticks);
}

// Print path in appropriate format
function printPath(
  writer: (line: string) => void,
  filePath: string,
  content: string,
  cxml: boolean,
  markdown: boolean,
  lineNumbers: boolean
): void {
  if (cxml) {
    printAsXml(writer, filePath, content, lineNumbers);
  } else if (markdown) {
    printAsMarkdown(writer, filePath, content, lineNumbers);
  } else {
    printDefault(writer, filePath, content, lineNumbers);
  }
}

// Recursive directory walker (mimics os.walk logic)
function walkDir(
  root: string,
  extensions: string[],
  includeHidden: boolean,
  ignoreFilesOnly: boolean,
  ignoreGitignore: boolean,
  gitignoreRules: string[],
  ignorePatterns: string[],
  ig: ReturnType<typeof ignore> | null,
  writer: (line: string) => void,
  cxml: boolean,
  markdown: boolean,
  lineNumbers: boolean
): void {
  let dirents = fs.readdirSync(root, { withFileTypes: true });
  if (!includeHidden) {
    dirents = dirents.filter((d) => !d.name.startsWith('.'));
  }
  let subdirs: string[] = [];
  let files: string[] = [];
  for (const dirent of dirents) {
    const full = path.join(root, dirent.name);
    if (dirent.isDirectory()) {
      subdirs.push(full);
    } else {
      files.push(dirent.name);
    }
  }
  if (!includeHidden) {
    files = files.filter((f) => !f.startsWith('.'));
  }
  // .gitignore semantics (project-root) via `ignore` package
  if (ig) {
    const relSubdirs = subdirs.map((d) => path.relative(process.cwd(), d));
    subdirs = subdirs.filter((d, idx) => !ig!.ignores(relSubdirs[idx]));
    const relFiles = files.map((f) => path.relative(process.cwd(), path.join(root, f)));
    files = files.filter((_, idx) => !ig!.ignores(relFiles[idx]));
  } else {
    // Fallback to local .gitignore rules (legacy behavior)
    if (!ignoreGitignore) {
      gitignoreRules.push(...readGitignore(root));
    }
    if (gitignoreRules.length > 0) {
      subdirs = subdirs.filter((d) => !shouldIgnore(d, gitignoreRules));
      files = files.filter((f) => !shouldIgnore(path.join(root, f), gitignoreRules));
    }
  }
  // Apply default ignore patterns in addition to user-provided ones
  const combinedIgnorePatterns = [...DEFAULT_IGNORES, ...ignorePatterns];
  if (combinedIgnorePatterns.length > 0) {
    if (!ignoreFilesOnly) {
      subdirs = subdirs.filter((d) => {
        const basename = path.basename(d);
        return !combinedIgnorePatterns.some((p) => fnmatch(basename, p));
      });
    }
    files = files.filter((f) => !combinedIgnorePatterns.some((p) => fnmatch(f, p)));
  }
  if (extensions.length > 0) {
    files = files.filter((f) => extensions.some((ext) => f.endsWith(ext)));
  }
  files.sort();
  for (const file of files) {
    const filePath = path.join(root, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      printPath(writer, filePath, content, cxml, markdown, lineNumbers);
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        // Ignore missing files
      } else {
        console.error(`Warning: Skipping file ${filePath} due to encoding error`);
      }
    }
  }
  for (const subdir of subdirs) {
    walkDir(subdir, extensions, includeHidden, ignoreFilesOnly, ignoreGitignore, gitignoreRules, ignorePatterns, ig, writer, cxml, markdown, lineNumbers);
  }
}

// Process a single path (file or dir)
function processPath(
  p: string,
  extensions: string[],
  includeHidden: boolean,
  ignoreFilesOnly: boolean,
  ignoreGitignore: boolean,
  gitignoreRules: string[],
  ignorePatterns: string[],
  ig: ReturnType<typeof ignore> | null,
  writer: (line: string) => void,
  cxml: boolean,
  markdown: boolean,
  lineNumbers: boolean
): void {
  if (fs.existsSync(p)) {
    const stats = fs.statSync(p);
    if (stats.isFile()) {
      // Skip files that match .gitignore rules or the default ignore patterns
      const combinedIgnorePatterns = [...DEFAULT_IGNORES, ...ignorePatterns];
      const rel = path.relative(process.cwd(), p);
      if ((ig && ig.ignores(rel)) || shouldIgnore(p, gitignoreRules) || shouldIgnore(p, combinedIgnorePatterns)) {
        return;
      }
      try {
        const content = fs.readFileSync(p, 'utf8');
        printPath(writer, p, content, cxml, markdown, lineNumbers);
      } catch (err) {
        if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
          console.error(`Warning: Skipping file ${p} due to encoding error`);
        }
      }
    } else if (stats.isDirectory()) {
      walkDir(p, extensions, includeHidden, ignoreFilesOnly, ignoreGitignore, gitignoreRules, ignorePatterns, ig, writer, cxml, markdown, lineNumbers);
    }
  }
}

// Read paths from stdin
function readPathsFromStdin(useNull: boolean): string[] {
  if (process.stdin.isTTY) {
    return [];
  }
  const data = fs.readFileSync(0, 'utf8');  // Read from stdin (fd 0)
  if (useNull) {
    return data.split('\0').filter((p) => p.trim());
  } else {
    return data.trim().split(/\s+/).filter((p) => p.trim());
  }
}

// Main CLI
function main(): void {
  const program = new Command();
  program
    .name('files2prompt')
    .description(
      'Takes one or more paths to files or directories and outputs every file, recursively, each one preceded with its filename.\n' +
      '\nDefault format:\n' +
      'path/to/file.py\n' +
      '---\n' +
      'Contents of file.py goes here\n' +
      '---\n' +
      '\nWith --cxml (XML for LLM/Claude):\n' +
      '<documents>\n' +
      '<document index="1">\n' +
      '<source>path/to/file1.txt</source>\n' +
      '<document_content>\n' +
      'Contents of file1.txt\n' +
      '</document_content>\n' +
      '</document>\n' +
      '...\n' +
      '</documents>\n' +
      '\nWith --markdown:\n' +
      'path/to/file1.py\n' +
      '```python\n' +
      'Contents of file1.py\n' +
      '```'
    )
    .version('1.0.0')
    .argument('[paths...]', 'Paths to files or directories')
    .option('-e, --extension <ext>', 'Filter by extension (repeatable, e.g., -e py -e js)', (v: string, prev: string[]) => prev.concat(v), [] as string[])
    .option('--include-hidden', 'Include files and folders starting with .')
    .option('--ignore-files-only', '--ignore option only ignores files')
    .option('--ignore-gitignore', 'Ignore .gitignore files and include all files')
    .option('-i, --ignore <pattern>', 'Pattern to ignore (supports fnmatch * ?; repeatable)', (v: string, prev: string[]) => prev.concat(v), [] as string[])
    .option('-o, --output <file>', 'Output to file instead of stdout')
    .option('-c, --cxml', 'Output in XML format optimized for LLM/Claude long context')
    .option('-m, --markdown', 'Output Markdown with fenced code blocks')
    .option('-n, --line-numbers', 'Add line numbers to output')
    .option('-0, --null', 'Use NUL as separator when reading from stdin');

  program.parse(process.argv);
  const opts = program.opts();
  const argPaths = program.args as string[];

  globalIndex = 1;
  let gitignoreRules: string[] = [];

  const outputStream: NodeJS.WritableStream = opts.output
    ? fs.createWriteStream(opts.output, { encoding: 'utf8' })
    : process.stdout;

  // Gracefully handle broken pipe (e.g., when piping to `head`)
  let brokenPipe = false;
  const onPipeError = (err: any) => {
    if (err && err.code === 'EPIPE') {
      brokenPipe = true;
      try { (outputStream as any).end?.(); } catch {}
      // Exit cleanly; avoid noisy stack trace
      try { process.exit(0); } catch {}
    }
  };
  (outputStream as any).on?.('error', onPipeError);
  if (!opts.output) {
    process.stdout.on('error', onPipeError);
  }

  const writer = (line: string): void => {
    if (brokenPipe) return;
    try {
      outputStream.write(line + '\n');
    } catch (err: any) {
      onPipeError(err);
    }
  };

  const stdinPaths = readPathsFromStdin(!!opts.null);
  let allPaths = [...argPaths, ...stdinPaths];

  if (allPaths.length === 0) {
    // Default to current directory if nothing was provided via args or stdin
    allPaths = ['.'];
  }

  // Build project-root ignore instance from CWD .gitignore (once)
  let ig: ReturnType<typeof ignore> | null = null;
  if (!opts.ignoreGitignore) {
    const rootGitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(rootGitignorePath)) {
      ig = ignore();
      const rules = readGitignore(process.cwd());
      if (rules.length > 0) ig.add(rules);
    }
  }

  for (let i = 0; i < allPaths.length; i++) {
    const p = allPaths[i];
    if (!fs.existsSync(p)) {
      console.error(`Error: Path does not exist: ${p}`);
      process.exit(1);
    }
    // Legacy pre-load of local .gitignore rules for direct files
    if (!opts.ignoreGitignore) {
      const dir = path.dirname(p);
      if (fs.existsSync(dir)) {
        gitignoreRules.push(...readGitignore(dir));
      }
    }
    if (opts.cxml && i === 0) {
      writer('<documents>');
    }
    processPath(
      p,
      Array.isArray(opts.extension) ? opts.extension : [],
      !!opts.includeHidden,
      !!opts.ignoreFilesOnly,
      !!opts.ignoreGitignore,
      gitignoreRules,
      Array.isArray(opts.ignore) ? opts.ignore : [],
      ig,
      writer,
      !!opts.cxml,
      !!opts.markdown,
      !!opts.lineNumbers
    );
  }

  if (opts.cxml) {
    writer('</documents>');
  }

  if (opts.output) {
    outputStream.end();
  }
}

// Run main (with error handling) unconditionally when this module loads as a CLI entrypoint.
// This avoids issues where certain npx/bin execution environments don't satisfy a "direct run" check.
try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}