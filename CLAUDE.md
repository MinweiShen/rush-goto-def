# CLAUDE.md — Project Guidelines

## Versioning & Changelog

- Follow semver: `MAJOR.MINOR.PATCH`
- **Bump version + update CHANGELOG.md** for: functionality changes, bug fixes, new features, breaking changes
- **Do NOT bump version or update CHANGELOG.md** for: documentation-only changes (README, comments, CLAUDE.md), code style, reformatting
- Version and changelog updates happen in the same commit as the code change

## Project Structure

- `src/client/extension.ts` — VS Code LSP client, IPC transport
- `src/server/server.ts` — LSP server entry, only registers `definitionProvider`
- `src/server/tsconfigResolver.ts` — finds + parses `tsconfig.json` with `extends` chains
- `src/server/moduleResolver.ts` — wraps `ts.resolveModuleName`, caches results, maps `.d.ts` → `.ts` source
- `src/server/symbolFinder.ts` — extracts exported symbols from a file via `ts.createSourceFile`
- `src/server/symbolIndex.ts` — lazy LRU cache (5000 files) with mtime invalidation
- `src/server/definitionProvider.ts` — orchestrates go-to-definition: import parsing → module resolution → symbol lookup → re-export chain following
- `src/server/fileWatcher.ts` — chokidar watcher, invalidates caches on file changes
- `test/fixtures/monorepo/` — Rush-like test fixture with 3 packages + path aliases
- `test/unit/` — vitest unit tests

## Build & Test

- `npm run build` — esbuild bundles client + server separately
- `npm test` — runs vitest
- `npm run package` — creates `.vsix` via `@vscode/vsce`
- Node 18 compatible (undici pinned to 6.x via overrides)

## Key Design Decisions

- No tree-sitter — reuses `typescript` package for both module resolution and AST parsing
- Lazy indexing — no upfront monorepo scan, files parsed on first access
- Logger respects `rushGotoDef.logLevel` setting, fetched from client config on startup and on change
