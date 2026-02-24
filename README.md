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

### From GitHub Releases

Download the latest `.vsix` from [GitHub Releases](https://github.com/MinweiShen/rush-goto-def/releases), then:

```bash
code --install-extension rush-goto-def-0.2.2.vsix
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

## Coexisting with the built-in TypeScript LSP

This extension is designed to run **alongside** the built-in TypeScript language server (`tsserver`). When both are active, VS Code merges their Go to Definition results. No extra configuration is strictly required, but the following settings improve the experience:

Add to your `.vscode/settings.json` (workspace) or user settings:

```jsonc
{
  // When both providers return results, jump directly instead of showing a peek widget
  "editor.gotoLocation.multipleDefinitions": "goto",

  // Optional: reduce tsserver memory by disabling features you don't need
  "typescript.disableAutomaticTypeAcquisition": true,
  "typescript.preferences.includePackageJsonAutoImports": "off"
}
```

**How it works in practice:**
- If tsserver is healthy → both providers respond, VS Code deduplicates or jumps to the first result
- If tsserver is slow or crashed → this extension still responds in ~5ms, so Go to Definition keeps working
- This extension never interferes with tsserver's diagnostics, completions, hover, or refactoring

## Disabling the built-in TypeScript LSP

To test this extension in isolation or to free up memory, you can disable the built-in TypeScript language server. **Note:** this removes all other TypeScript IDE features (diagnostics, completions, hover, formatting, etc.) — only Go to Definition from this extension will remain.

### Option A: Disable for the current workspace only (recommended for testing)

1. Open Extensions sidebar (Cmd+Shift+X)
2. Type `@builtin typescript` in the search bar
3. Find **"TypeScript and JavaScript Language Features"** (not "TypeScript Language Basics")
4. Click the gear icon → **Disable (Workspace)**
5. Reload the window (Cmd+Shift+P → "Developer: Reload Window")

This keeps tsserver active in your other projects.

### Option B: Disable globally

Same as Option A, but click **Disable** instead of "Disable (Workspace)". Affects all VS Code windows.

### Option C: Via settings.json

```jsonc
{
  // Disable tsserver's Go to Definition only (keeps diagnostics, completions, etc.)
  // Unfortunately VS Code does not support this — it's all or nothing.

  // To fully disable, add this to .vscode/settings.json:
  "typescript.tsdk": "/dev/null"
}
```

This causes tsserver to fail to start, effectively disabling it. To re-enable, remove the line and reload.

### Option D: Via CLI

```bash
# List built-in extensions
code --list-extensions --show-versions | grep typescript

# Disable it
code --disable-extension vscode.typescript-language-features
```

To re-enable:
```bash
code --enable-extension vscode.typescript-language-features
```

### Verifying this extension is working alone

1. Disable the built-in TypeScript LSP using any option above
2. Reload VS Code
3. Open a `.ts` file and set `"rushGotoDef.logLevel": "info"` in settings
4. Open the Output panel (Cmd+Shift+U) → select **"Rush Go to Definition"**
5. Cmd+click on an imported symbol — you should see logs like:
   ```
   [gotodef] Request: main.ts:4:15
   [gotodef] Symbol under cursor: "add"
   [gotodef] Resolved "add" → /path/to/math.ts:1:17 (3ms)
   ```
6. If it jumps to the correct source file, the extension is working independently

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
