# files2prompt

Cross-platform CLI that recursively reads files/dirs and formats them as LLM prompts
(XML, Markdown, JSON, or plain text). Published to npm as `files2prompt` / `f2p`.

## Tech Stack
- Node.js >= 22, TypeScript (ES2022, ESM, `nodenext`), strict mode
- `commander` (CLI), `ignore` (.gitignore semantics)
- `vitest` (test runner, globals enabled), `pnpm` (only — no npm/yarn)
- `semantic-release` + Conventional Commits → auto-publish on `main`

## Critical Rules
- **ESM imports must use `.js` extensions** (e.g. `from './utils.js'`) even for `.ts` source.
- **Conventional Commits required** (`feat:`, `fix:`, etc.) — commitlint enforces, semantic-release parses. Header ≤ 150 chars.
- Use `pnpm` only. Node 22+ required (`engines`).
- No code style docs here — rely on `tsc --strict` and existing patterns.
- Don't auto-run `main()` from `src/index.ts`; entrypoint is `src/cli.ts`.
- Exit code `2` when zero files processed (unless `--quiet`).

## Commands
- `pnpm build` — clean `dist/`, compile TS
- `pnpm dev -- [opts]` — run via tsx from source
- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage`
- `pnpm start -- [opts]` — run built CLI

## Progressive Disclosure
Read relevant files from `agent_docs/` when working on these areas:
- `agent_docs/architecture.md` — module layout, data flow, output formats
- `agent_docs/commands.md` — full CLI options, flags, and examples
