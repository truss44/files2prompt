# Architecture

## Module Layout (`src/`)
- `cli.ts` — entrypoint (`#!/usr/bin/env node`); imports and calls `main()` from `index.ts`, catches errors, exits 1.
- `index.ts` — `main()`: builds the `commander` Program, parses opts, sets up output stream (stdout or file), reads stdin paths, builds the project-root `ignore` instance from CWD `.gitignore`, then drives `processPath` for each input path. Owns JSON wrapper (`[` / `]`) and XML wrapper (`<documents>` / `</documents>`). Module-scope option flags (`OPT_RELATIVE`, `OPT_QUIET`, `OPT_MAX_FILES`, `OPT_MAX_SIZE`).
- `walker.ts` — `walkDir()` (recursive) and `processPath()` (file-or-dir dispatch). Applies `.gitignore` (via `ignore` package when present, else local rule accumulation), `DEFAULT_IGNORES` + user `-i` patterns (fnmatch on basename), extension filter, `maxFiles` / `maxSize` limits, binary-file skipping. Calls into `printing.ts` per file.
- `printing.ts` — formatters: `printDefault`, `printAsXml` (indexed `<document>` for LLM long context), `printAsMarkdown` (fenced blocks, auto language hint, backtick fencing extended when content contains backticks), `printAsJson`. `printPath` dispatches. `globalIndex` is reset via `resetDocumentIndex()` at start of each run.
- `utils.ts` — `EXT_TO_LANG` map, `DEFAULT_IGNORES`, `BINARY_EXTENSIONS`, `isBinaryFile` (extension + 512-byte NUL/control-char sniff), `fnmatch` (`*`/`?`), `shouldIgnore` (basename match, dir-aware trailing slash), `readGitignore`, `addLineNumbers` (padded), `writeMultiLine`, `readPathsFromStdin` (whitespace or NUL).

## Data Flow
```
argv/stdin → index.main() → processPath() / walkDir()
  → ignore filters + extension/size/binary filters
  → printing.printPath|printAsJson → writer(line) → stdout|file
```

## Output Formats
- **default**: `path\n---\ncontent\n---`
- **`-c/--cxml`**: `<documents>` wrapper, indexed `<document index="N">` with `<source>` and `<document_content>`. No XML escaping (assumes source has no raw `<>`).
- **`-m/--markdown`**: `path` then fenced code block with language from `EXT_TO_LANG`; backtick length grows if content contains the fence.
- **`-j/--json`**: JSON array of `{index, source, content}`; commas injected by `index.ts` walker writer (`JSON_FIRST` flag).

## Key Behaviors
- Default path is `.` when no args and no stdin.
- `.gitignore` is read recursively (accumulated in `gitignoreRules`) and also from CWD once via the `ignore` package (`ig`).
- `DEFAULT_IGNORES` always applied: `.env`, `.env.*`, `.env*`, `.gitignore`.
- Broken pipe (`EPIPE`) is handled cleanly to support piping into `head`.
- Binary files skipped via extension set + content sniff; non-UTF8 read errors warn to stderr (unless `--quiet`).
