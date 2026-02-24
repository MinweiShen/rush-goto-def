# Rush Go to Definition

A lightweight VS Code extension that provides fast "Go to Definition" for TypeScript files in Rush monorepos. It runs as a separate language server alongside the built-in `tsserver`, using minimal memory (~100MB vs tsserver's 500MB-2GB).

## Features

- **Fast**: 2-5ms warm, 15-30ms cold — near-instant Cmd+click
- **Low memory**: ~100-120MB, no full type-checking or project loading
- **Barrel file support**: Follows re-export chains through index.ts files
- **Path alias support**: Reads `compilerOptions.paths` from tsconfig.json
- **Rush/pnpm symlink support**: Resolves symlinked packages via `realpath`
- **`.d.ts` → source mapping**: Jumps to `.ts` source files instead of declaration files
- **Coexists with tsserver**: VS Code merges results from both providers

## What it does NOT do

This extension **only** provides Go to Definition. No diagnostics, no completions, no hover, no refactoring. Those continue to come from the built-in TypeScript language server.

## Installation

### From .vsix file

```bash
# Build
cd rush-goto-def
npm install
npm run build
npx @vscode/vsce package --no-dependencies

# Install
code --install-extension rush-goto-def-0.1.0.vsix
```

Or in VS Code: Extensions sidebar → `...` menu → "Install from VSIX..."

### From source (development)

```bash
cd rush-goto-def
npm install
npm run build
```

Then press F5 in VS Code to launch the Extension Development Host.

## Usage

1. Open a TypeScript file in your Rush monorepo
2. Cmd+click (or F12) on any imported symbol
3. Jumps to the source definition, following through barrel files and re-exports

### Viewing logs

Open the Output panel (Cmd+Shift+U) and select **"Rush Go to Definition"** from the dropdown. You'll see logs like:

```
[server] Rush Go to Definition server initialized. Root: /path/to/monorepo
[server] File watcher started.
[gotodef] Request: main.ts:4:15
[gotodef] Symbol under cursor: "add"
[gotodef] Found import: "add" from "@monorepo/utils"
[gotodef] Module resolved: /path/to/packages/utils/src/index.ts
[gotodef] Resolved "add" → /path/to/packages/utils/src/math.ts:1:17 (3ms)
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `rushGotoDef.enable` | `true` | Enable/disable the extension |
| `rushGotoDef.logLevel` | `"warn"` | Logging verbosity (`off`, `error`, `warn`, `info`, `debug`) |

## How it works

```
Cmd+click on symbol
  → Parse imports to find module specifier + symbol name
  → Resolve module via ts.resolveModuleName (handles path aliases, Rush symlinks)
  → Map .d.ts → .ts source file if applicable
  → Parse target file via ts.createSourceFile (single-file, no type checking)
  → Find exported symbol in AST
  → Follow re-export chains through barrel files (depth limit: 10)
  → Return location to VS Code
```

Key design choices:
- **No tree-sitter** — reuses the `typescript` package already needed for module resolution
- **Lazy indexing** — files parsed on first access, cached with mtime-based invalidation
- **Cache cap**: 5,000 files (~10MB)
- **File watcher**: Invalidates caches on `.ts`, `tsconfig.json`, and `package.json` changes

## Tips

- If both this extension and tsserver return results, VS Code may show a peek widget. Set `"editor.gotoLocation.multipleDefinitions": "goto"` to auto-jump to the first result.
- If tsserver is crashing due to memory, you can disable it: Cmd+Shift+X → search `@builtin typescript` → disable "TypeScript and JavaScript Language Features". You'll lose diagnostics/completions but keep Go to Definition via this extension.

## Development

```bash
npm run build    # Bundle client + server
npm run watch    # Watch mode
npm test         # Run unit tests (vitest)
npm run package  # Create .vsix
```

## Uninstall

```bash
code --uninstall-extension rush-goto-def
```
