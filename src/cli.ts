import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import ignore from 'ignore';
import { readGitignore, readPathsFromStdin } from './utils';
import { processPath } from './walker';
import { resetDocumentIndex } from './printing';

export function main(): void {
  const program = new Command();
  program
    .name('prompt2files')
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

  resetDocumentIndex();
  let gitignoreRules: string[] = [];

  const outputStream: NodeJS.WritableStream = opts.output
    ? fs.createWriteStream(opts.output, { encoding: 'utf8' })
    : process.stdout;

  const writer = (line: string): void => {
    outputStream.write(line + '\n');
  };

  const stdinPaths = readPathsFromStdin(!!opts.null);
  const allPaths = [...argPaths, ...stdinPaths];

  if (allPaths.length === 0) {
    if (opts.output) outputStream.end();
    return;
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
