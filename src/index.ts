#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import ignore from 'ignore';
import { resetDocumentIndex } from './printing.js';
import { processPath as processPathMod } from './walker.js';
import { readGitignore as readGitignoreMod, readPathsFromStdin as readPathsFromStdinMod } from './utils.js';

let OPT_RELATIVE = false;
let OPT_QUIET = false;
let OPT_MAX_FILES: number | null = null;
let OPT_MAX_SIZE: number | null = null; // bytes
let PROCESSED_COUNT = 0;
let JSON_FIRST = true;

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
      !!opts.lineNumbers,
      !!opts.json,
      options
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

  const TOTAL_PROCESSED = PROCESSED_COUNT + (counter.count ?? 0);
  if (TOTAL_PROCESSED === 0) {
    if (!OPT_QUIET) {
      console.error('No files were processed. Check your paths, filters, and ignore settings.');
    }
    try { process.exit(2); } catch {}
  }
}

// Note: Do not auto-run main() here. The CLI entrypoint in src/cli.ts will import and execute main().