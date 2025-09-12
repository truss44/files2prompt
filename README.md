# prompt2files

[![npm version](https://badge.fury.io/js/prompt2files.svg)](https://badge.fury.io/js/prompt2files)
[![CI](https://github.com/truss44/prompt2files/actions/workflows/node.js.yml/badge.svg?branch=main)](https://github.com/truss44/prompt2files/actions)

A cross-platform CLI tool to read files and directories, recursively process them (respecting `.gitignore` and custom ignores), and format their contents as structured prompts optimized for Large Language Models (LLMs) like Claude or GPT. Supports XML output tailored for long-context windows, Markdown code blocks, or a simple default format. Built with TypeScript for Node.js 18+; works on Windows, macOS, and Linux (including WSL2).

This is a Node.js/TypeScript port of [files-to-prompt](https://github.com/simonw/files-to-prompt), with enhancements for LLM consumption (e.g., indexed XML documents for easy retrieval in prompts).

## Features
- **Recursive Processing**: Walk directories, filter by extensions, include/exclude hidden files.
- **Ignore Support**: Respects `.gitignore` (accumulates rules recursively) and custom fnmatch patterns (`*` and `?` wildcards).
- **Output Formats**:
  - **Default**: Simple filename + separator + content (human-readable).
  - **XML (`--cxml`)**: Structured `<documents>` wrapper with indexed `<document>` tags, `<source>` path, and `<document_content>`. Optimized for LLMs—simple tags, no heavy escaping, line-number support for precise referencing in prompts (e.g., "Refer to line 42 in document 3").
  - **Markdown (`--markdown`)**: Fenced code blocks with automatic language detection (e.g., ```python).
- **Stdin Input**: Read paths from stdin (whitespace or NUL-separated for tools like `find` or `git ls-files`).
- **Line Numbers**: Optional prefixed numbers for code analysis.
- **Output to File**: Write to a file instead of stdout (UTF-8).
- **Error Handling**: Skips non-UTF8 files with warnings; validates paths.
- **Cross-Platform**: Handles Windows/WSL2 paths seamlessly via Node's `path` module.

## Installation
Install globally for easy use:
```bash
npm install -g prompt2files
```

Or run directly without installation (via npx):
```bash
npx prompt2files [options] [paths...]
```

Requires Node.js 18+.

## Quick Start

Get up and running in seconds with the most common commands.

- Basic: process a directory in the default format

  ```bash
  prompt2files ./src
  ```

- XML optimized for LLMs (with line numbers)

  ```bash
  prompt2files -c --line-numbers .
  ```

- Markdown output with fenced code blocks and language hints

  ```bash
  prompt2files -m ./src
  ```

- Filter by extension and respect .gitignore rules (default behavior)

  ```bash
  prompt2files -e ts -e js .
  ```

- Write the output to a file

  ```bash
  prompt2files -c -o codebase.xml .
  ```

## Usage

```bash
prompt2files [options] [paths...]
```

- `[paths...]`: One or more file/directory paths (e.g., `./src` or `file.py`). If none provided, reads from stdin.
- Output goes to stdout (or `--output` file).

### Options
- `-e, --extension <ext>`: Filter files by extension (repeatable, e.g., `-e py -e ts`). Case-sensitive.
- `--include-hidden`: Include hidden files/folders (starting with `.`).
- `--ignore-files-only`: Apply `--ignore` patterns only to files (not directories).
- `--ignore-gitignore`: Ignore all `.gitignore` files and process everything.
- `-i, --ignore <pattern>`: Ignore files/directories matching fnmatch pattern (repeatable, e.g., `-i "*.log" -i "node_modules/*"`). Supports `*` (any chars) and `?` (single char).
- `-o, --output <file>`: Write output to a file (UTF-8).
- `-c, --cxml`: Output in XML format optimized for LLMs (e.g., Claude's long context). Wraps in `<documents>` with indexed `<document>` for batch processing.
- `-m, --markdown`: Output Markdown with fenced code blocks and language syntax highlighting.
- `-n, --line-numbers`: Prefix content with line numbers (padded for alignment; useful for LLM code reviews).
- `-0, --null`: Use NUL (`\0`) as path separator when reading from stdin (e.g., for `find -print0`).

Run `prompt2files --help` for full details.

### Examples

#### Basic: Process a Directory (Default Format)
```bash
prompt2files ./src
```

Output:

```
src/index.ts
---
import * as fs from 'fs';
// ... content ...
---
src/utils.ts
---
export function util() { /* ... */ }
// ... content ...
---
```

#### XML for LLM Prompts (Optimized for Claude/GPT)

Ideal for feeding entire codebases into LLMs. Indices allow referencing (e.g., "Analyze document 1, lines 10-20").

```bash
prompt2files -c --line-numbers ./src
```

### Output (wrapped in `<documents>`):

```xml
<documents>
<document index="1">
<source>src/index.ts</source>
<document_content>
  1  #!/usr/bin/env node
  2
  3  import * as fs from 'fs';
  // ... numbered content ...
</document_content>
</document>
<document index="2">
<source>src/utils.ts</source>
<document_content>
  1  export function util() {
  // ... numbered content ...
</document_content>
</document>
...
</documents>
```
### LLM Tip: Paste this directly into a prompt: "You are a code reviewer. Review the codebase: [XML here]. Focus on security issues in document 1."

#### Markdown for Documentation/Sharing

```bash
prompt2files -m ./src
```

Output:

```text
src/index.ts
```

```typescript
#!/usr/bin/env node

import * as fs from 'fs';
// ... content ...
```

src/utils.ts

```typescript
export function util() { /* ... */ }
// ... content ...
```

#### Filter by Extensions + Ignores + Stdin

List TypeScript files, ignoring tests and node_modules, via stdin:

```bash
find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/tests/*" | prompt2files -c -e ts -0
```

(Uses --null if paths are NUL-separated; adjust with find ... -print0.)

#### Output to File

```bash
prompt2files -o output.txt ./src
```

#### Output to File + Hidden Files

```bash
prompt2files --include-hidden -c -o codebase.xml .
```

Generates codebase.xml with all files (including .env, etc.) in XML format.

### Respect .gitignore

By default, reads and applies .gitignore rules recursively (e.g., skips node_modules/). Use --ignore-gitignore to override.

### XML optimization for LLMs

The --cxml format is designed for prompt engineering:

- Structure: `<documents> root → <document index="N"> → <source>path</source> → <document_content>content</document_content>`. 
- No Escaping: Assumes code doesn't contain raw <> (common for source code); LLMs parse it contextually.
- Indices & Line Numbers: Enables precise instructions like "Fix bugs in document 5, line 23."
- Long Context: Compact for models with 200k+ token limits (e.g., Claude 3.5 Sonnet).
- Batch Feeding: Feed the entire output as a single prompt for codebase analysis, refactoring, or Q&A.

If content has conflicting tags, consider post-processing or using Markdown instead.

### Troubleshooting

- Encoding Errors: Non-UTF8 files (e.g., binaries) are skipped with a warning to stderr.
- Stdin on Windows: Use type file.txt | prompt2files or PowerShell equivalents. For NUL, ensure tools output \0.
- Permissions: Run with sufficient read access; tool doesn't modify files.
- Large Directories: Sync FS ops may be slow for millions of files—consider piping git ls-files for repos.
- WSL2/Windows Paths: Node handles mixed separators; use forward slashes in commands for consistency.

### Development & Contributing

- Setup: Clone repo, npm install, npm run build, npm run dev -- [options] for testing.
- Build: npm run build (compiles TS to JS in ./dist).
- Test: npm test (placeholder; add Jest/Mocha for real tests).
- Commits: Use Conventional Commits (e.g., feat: add json support) for semantic-release.
- Releasing: Pushes to main trigger auto-release via semantic-release (npm publish, changelog, GitHub tags).
- Contribute: Fork, PR with tests/docs. Issues welcome!

### License

MIT License. See [LICENSE](LICENSE).