# Commands & CLI Reference

## Development
- `pnpm build` — `rm -rf dist && tsc`
- `pnpm dev -- [opts] [paths...]` — run from source via `tsx src/index.ts`
- `pnpm start -- [opts] [paths...]` — run built `dist/cli.js`
- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` — vitest (globals enabled)
- `pnpm release` — semantic-release (runs in CI on `main`)

## CLI Usage
```
files2prompt [options] [paths...]    # aliases: f2p, files2prompt-cli, f2p-cli
```
No paths + no stdin → defaults to `.`. Output to stdout unless `-o`. Exits `2` if zero files processed (unless `--quiet`).

## Options
| Flag | Description |
|---|---|
| `-e, --extension <ext>` | Filter by extension (repeatable; `.ts` or `ts` both ok) |
| `--include-hidden` | Include dotfiles/dotdirs |
| `--ignore-files-only` | `-i` patterns apply to files only, not dirs |
| `--ignore-gitignore` | Skip all `.gitignore` processing |
| `-i, --ignore <pattern>` | fnmatch pattern (`*`,`?`); repeatable |
| `-o, --output <file>` | Write to file (UTF-8); creates parent dirs |
| `-c, --cxml` | XML output for LLM long context |
| `-m, --markdown` | Markdown fenced code blocks |
| `-n, --line-numbers` | Prefix lines with padded numbers |
| `-j, --json` | JSON array of `{index, source, content}` |
| `-0, --null` | NUL separator for stdin paths (`find -print0`) |
| `--relative` | Paths relative to CWD |
| `--quiet` | Suppress stderr warnings |
| `--max-files <n>` | Cap number of files processed |
| `--max-size <bytes>` | Skip files larger than size; supports `k`/`m`/`g` |

## Common Examples
```bash
files2prompt ./src                              # default format
files2prompt -c --line-numbers .                # XML for LLM prompts
files2prompt -m ./src                           # Markdown
files2prompt --json --max-files 100 . > f.json  # JSON, capped
files2prompt -e ts -e js .                      # extension filter
files2prompt -c -o codebase.xml .               # to file
find . -name "*.ts" -print0 | files2prompt -c -e ts -0   # stdin + NUL
```

## Gotchas
- `node -c` is Node's own flag — use `files2prompt -c` or `node dist/cli.js -c`.
- `--max-size` suffixes are case-insensitive: `200k`, `5m`, `1g`.
- Extensions are normalized to leading-dot form internally.
