import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { DEFAULT_IGNORES, readGitignore, shouldIgnore, fnmatch, isBinaryFile } from './utils.js';
import { printPath, printAsJson } from './printing.js';

export interface WalkOptions {
  quiet?: boolean;
  pathMapper?: (p: string) => string;
  maxFiles?: number;
  maxSize?: number; // in bytes
  counter?: { count: number };
}

// Recursive directory walker
export function walkDir(
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
  lineNumbers: boolean,
  json: boolean = false,
  options: WalkOptions = {}
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
    // Fallback to local .gitignore rules
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
    // Enforce maxFiles limit, if specified
    if (options.maxFiles !== undefined && options.counter && options.counter.count >= options.maxFiles) {
      return;
    }
    try {
      // Skip binary files
      if (isBinaryFile(filePath)) {
        continue;
      }
      // Enforce maxSize limit, if specified
      if (options.maxSize !== undefined) {
        try {
          const st = fs.statSync(filePath);
          if (st.size > options.maxSize) {
            if (!options.quiet) {
              console.error(`Warning: Skipping file ${filePath} due to size > ${options.maxSize} bytes`);
            }
            continue;
          }
        } catch {}
      }
      const content = fs.readFileSync(filePath, 'utf8');
      const displayPath = options.pathMapper ? options.pathMapper(filePath) : filePath;
      if (json) {
        printAsJson(writer, displayPath, content, lineNumbers);
      } else {
        printPath(writer, displayPath, content, cxml, markdown, lineNumbers);
      }
      if (options.counter) options.counter.count++;
    } catch (err: any) {
      if (err && err.code === 'ENOENT') {
        // Ignore missing files
      } else {
        if (!options.quiet) {
          console.error(`Warning: Skipping file ${filePath} due to encoding error`);
        }
      }
    }
  }
  for (const subdir of subdirs) {
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
      lineNumbers,
      json,
      options
    );
  }
}

// Process a single path (file or dir)
export function processPath(
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
  lineNumbers: boolean,
  json: boolean = false,
  options: WalkOptions = {}
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
        // Skip binary files
        if (isBinaryFile(p)) {
          return;
        }
        // Enforce maxSize limit, if specified
        if (options.maxSize !== undefined) {
          try {
            const st = fs.statSync(p);
            if (st.size > options.maxSize) {
              if (!options.quiet) {
                console.error(`Warning: Skipping file ${p} due to size > ${options.maxSize} bytes`);
              }
              return;
            }
          } catch {}
        }
        const content = fs.readFileSync(p, 'utf8');
        const displayPath = options.pathMapper ? options.pathMapper(p) : p;
        if (json) {
          printAsJson(writer, displayPath, content, lineNumbers);
        } else {
          printPath(writer, displayPath, content, cxml, markdown, lineNumbers);
        }
        if (options.counter) options.counter.count++;
      } catch (err: any) {
        if (!(err && err.code === 'ENOENT')) {
          if (!options.quiet) {
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
        lineNumbers,
        json,
        options
      );
    }
  }
}
