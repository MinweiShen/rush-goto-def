# Changelog

## [0.3.1] - 2026-02-24

### Changed

- Hover is now disabled by default (set `rushGotoDef.enableHover: true` to enable)
- Improved Rush lock file detection to support both `rush#*.lock` and `rush.lock` patterns

## [0.3.0] - 2026-02-24

### Added

- Hover support: show type signatures and JSDoc documentation when hovering over symbols
- Uses TypeScript Language Service for accurate type information
- Smart Rush build detection: file watcher automatically pauses during `rush build` to prevent slowdowns, then invalidates caches when build completes

## [0.2.3] - 2026-02-24

### Fixed

- Fix CI and now it should work in github actions

## [0.2.3] - 2026-02-24

### Fixed

- Fix symbol extraction breaking on identifiers containing digits (e.g. `S2SImpression` was incorrectly extracted as `SImpression`)

## [0.2.2] - 2026-02-24

### Fixed

- Fix go-to-definition resolving to `.d.ts` instead of source when packages have nested output directories (`dist/cjs/`, `dist/esm/`, etc.)
- Reduce packaged server bundle from 3.66 MB to 251 KB by externalizing TypeScript

## [0.2.1] - 2026-02-24

### Fixed

- Logger now respects the `rushGotoDef.logLevel` setting (was logging everything regardless of configured level)
- Log level is fetched from VS Code configuration on startup and updated dynamically when the setting changes

## [0.2.0] - 2026-02-24

### Added

- Extension icon/logo
- Detailed logging in VS Code Output panel ("Rush Go to Definition")
  - Server lifecycle events (init, file watcher start)
  - Per-request logs: symbol, import, module resolution, target location, elapsed time
  - File watcher cache invalidation events
- `.d.ts` to `.ts` source file mapping (avoids jumping to declaration files)
  - Same-directory mapping: `foo.d.ts` → `foo.ts`
  - Output-to-source dir mapping: `dist/foo.d.ts` → `src/foo.ts`
  - Package-root relative mapping via `package.json` detection
- README documentation
- CHANGELOG

## [0.1.0] - 2026-02-24

### Added

- Initial release
- LSP-based Go to Definition for TypeScript/TSX files
- `tsconfig.json` resolution with `extends` chain support
- Module resolution via `ts.resolveModuleName` (path aliases, Rush symlinks, node_modules)
- AST-based exported symbol extraction via `ts.createSourceFile`
- Lazy symbol cache with mtime invalidation and 5,000-file LRU eviction
- Re-export chain following through barrel files (depth limit: 10)
- Local (same-file) definition lookup
- `require()` import support
- File watcher (chokidar) for automatic cache invalidation
- Extension settings: `rushGotoDef.enable`, `rushGotoDef.logLevel`
- Unit tests (30 tests across 5 test files)
- esbuild bundling (client + server)
- `.vsix` packaging
