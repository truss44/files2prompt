#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import ignore from 'ignore';
import { resetDocumentIndex } from './printing';
import { processPath as processPathMod } from './walker';
import { readGitignore as readGitignoreMod, readPathsFromStdin as readPathsFromStdinMod } from './utils';

// Module-scope options and counters for CLI behavior
let OPT_RELATIVE = false;
let OPT_QUIET = false;
let OPT_MAX_FILES: number | null = null;
let OPT_MAX_SIZE: number | null = null; // bytes
let PROCESSED_COUNT = 0;
let JSON_FIRST = true;

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
  md: 'markdown',
  txt: 'text',
  csv: 'csv',
  jsonl: 'jsonl',
  pl: 'perl',
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

// Parse sizes like "1024", "10k", "5m", "1g" (case-insensitive). Returns bytes.
function parseSize(val: string): number {
  const m = /^\s*(\d+)\s*([kKmMgG]?)\s*$/.exec(val);
  if (!m) return Number.NaN;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 'k') return n * 1024;
  if (unit === 'm') return n * 1024 * 1024;
  if (unit === 'g') return n * 1024 * 1024 * 1024;
  return n;
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

// Print path in JSON format (single-line object; caller manages array commas/wrapper)
function printAsJson(writer: (line: string) => void, filePath: string, content: string, lineNumbers: boolean): void {
  if (lineNumbers) {
    content = addLineNumbers(content);
  }
  const obj = { index: globalIndex, source: filePath, content };
  writer(JSON.stringify(obj));
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

// Recursive directory walker
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
  json: boolean,
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
    // Enforce max files limit
    if (OPT_MAX_FILES !== null && PROCESSED_COUNT >= OPT_MAX_FILES) {
      return;
    }
    try {
      // Enforce max size limit
      if (OPT_MAX_SIZE !== null) {
        try {
          const st = fs.statSync(filePath);
          if (st.size > OPT_MAX_SIZE) {
            if (!OPT_QUIET) {
              console.error(`Warning: Skipping file ${filePath} due to size > ${OPT_MAX_SIZE} bytes`);
            }
            continue;
          }
        } catch {}
      }
      const content = fs.readFileSync(filePath, 'utf8');
      const displayPath = OPT_RELATIVE ? path.relative(process.cwd(), filePath) : filePath;
      if (json) {
        if (!JSON_FIRST) writer(',');
        printAsJson(writer, displayPath, content, lineNumbers);
        JSON_FIRST = false;
      } else {
        printPath(writer, displayPath, content, cxml, markdown, lineNumbers);
      }
      PROCESSED_COUNT++;
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        // Ignore missing files
      } else {
        if (!OPT_QUIET) {
          console.error(`Warning: Skipping file ${filePath} due to encoding error`);
        }
      }
    }
  }
  for (const subdir of subdirs) {
    if (OPT_MAX_FILES !== null && PROCESSED_COUNT >= OPT_MAX_FILES) {
      return;
    }
    walkDir(
      subdir,
      extensions,
      includeHidden,
      ignoreFilesOnly,
      ignoreGitignore,
      gitignoreRules,
      ignorePatterns,
      ig,
      writer,
      cxml,
      markdown,
      json,
      lineNumbers
    );
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
  json: boolean,
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
      // Enforce max files limit
      if (OPT_MAX_FILES !== null && PROCESSED_COUNT >= OPT_MAX_FILES) {
        return;
      }
      try {
        // Enforce max size limit
        if (OPT_MAX_SIZE !== null) {
          try {
            const st = fs.statSync(p);
            if (st.size > OPT_MAX_SIZE) {
              if (!OPT_QUIET) {
                console.error(`Warning: Skipping file ${p} due to size > ${OPT_MAX_SIZE} bytes`);
              }
              return;
            }
          } catch {}
        }
        const content = fs.readFileSync(p, 'utf8');
        const displayPath = OPT_RELATIVE ? path.relative(process.cwd(), p) : p;
        if (json) {
          if (!JSON_FIRST) writer(',');
          printAsJson(writer, displayPath, content, lineNumbers);
          JSON_FIRST = false;
        } else {
          printPath(writer, displayPath, content, cxml, markdown, lineNumbers);
        }
        PROCESSED_COUNT++;
      } catch (err) {
        if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
          if (!OPT_QUIET) {
            console.error(`Warning: Skipping file ${p} due to encoding error`);
          }
        }
      }
    } else if (stats.isDirectory()) {
      walkDir(
        p,
        extensions,
        includeHidden,
        ignoreFilesOnly,
        ignoreGitignore,
        gitignoreRules,
        ignorePatterns,
        ig,
        writer,
        cxml,
        markdown,
        json,
        lineNumbers
      );
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
export function main(): void {
  const program = new Command();
  // Resolve version from package.json
  let pkgVersion = '0.0.0';
  try {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkgStr = fs.readFileSync(pkgUrl, 'utf8');
    const pkgJson = JSON.parse(pkgStr);
    if (typeof pkgJson.version === 'string') {
      pkgVersion = pkgJson.version;
    }
  } catch {}

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
    .version(pkgVersion)
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
    .option('-j, --json', 'Output as a JSON array of {index, source, content}')
    .option('-0, --null', 'Use NUL as separator when reading from stdin')
    .option('--relative', 'Output paths relative to current working directory')
    .option('--quiet', 'Suppress warnings to stderr')
    .option('--max-files <n>', 'Maximum number of files to process', (v: string) => parseInt(v, 10))
    .option('--max-size <bytes>', 'Maximum file size to include (bytes; supports k/m/g suffix)', (v: string) => parseSize(v));

  program.showHelpAfterError(true);
  program.parse(process.argv);
  const opts = program.opts();
  const argPaths = program.args as string[];

  resetDocumentIndex();
  // Initialize module-scope options
  OPT_RELATIVE = !!opts.relative;
  OPT_QUIET = !!opts.quiet;
  OPT_MAX_FILES = Number.isFinite(opts.maxFiles) && typeof opts.maxFiles === 'number' ? opts.maxFiles : null;
  OPT_MAX_SIZE = Number.isFinite(opts.maxSize) && typeof opts.maxSize === 'number' ? opts.maxSize : null;
  PROCESSED_COUNT = 0;
  let gitignoreRules: string[] = [];
  JSON_FIRST = true;

  // Ensure output directory exists, if writing to a file
  if (opts.output) {
    try {
      const outDir = path.dirname(opts.output);
      if (outDir && outDir !== '.') {
        fs.mkdirSync(outDir, { recursive: true });
      }
    } catch {}
  }
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

  const stdinPaths = readPathsFromStdinMod(!!opts.null);
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
      const rules = readGitignoreMod(process.cwd());
      if (rules.length > 0) ig.add(rules);
    }
  }

  // Normalize extensions to ensure they have a leading dot (e.g., "ts" -> ".ts")
  const normalizedExtensions: string[] = (Array.isArray(opts.extension) ? opts.extension : []).map((e: string) =>
    e.startsWith('.') ? e : `.${e}`
  );

  // JSON wrapper begin
  if (opts.json) {
    writer('[');
  }

  // Prepare writer for walker: in JSON mode, emit commas between items
  const walkerWriter: (line: string) => void = (!!opts.json)
    ? (line: string) => { if (!JSON_FIRST) writer(','); writer(line); JSON_FIRST = false; }
    : writer;

  // Build walker options
  const counter = { count: 0 };
  const options = {
    quiet: !!opts.quiet,
    pathMapper: !!opts.relative ? (p: string) => path.relative(process.cwd(), p) : undefined,
    maxFiles: OPT_MAX_FILES === null ? undefined : OPT_MAX_FILES,
    maxSize: OPT_MAX_SIZE === null ? undefined : OPT_MAX_SIZE,
    counter,
  } as const;

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
        gitignoreRules.push(...readGitignoreMod(dir));
      }
    }
    if (opts.cxml && i === 0) {
      writer('<documents>');
    }
    processPathMod(
      p,
      normalizedExtensions,
      !!opts.includeHidden,
      !!opts.ignoreFilesOnly,
      !!opts.ignoreGitignore,
      gitignoreRules,
      Array.isArray(opts.ignore) ? opts.ignore : [],
      ig,
      walkerWriter,
      !!opts.cxml,
      !!opts.markdown,
      !!opts.json,
      !!opts.lineNumbers
    );
  }

  if (opts.cxml) {
    writer('</documents>');
  }

  // JSON wrapper end
  if (opts.json) {
    writer(']');
  }

  if (opts.output) {
    outputStream.end();
  }

  if (PROCESSED_COUNT === 0) {
    if (!OPT_QUIET) {
      console.error('No files were processed. Check your paths, filters, and ignore settings.');
    }
    try { process.exit(2); } catch {}
  }
}

// Note: Do not auto-run main() here. The CLI entrypoint in src/cli.ts will import and execute main().