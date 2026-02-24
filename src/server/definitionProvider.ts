import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import { Position, Location, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TsconfigResolver } from "./tsconfigResolver";
import { ModuleResolver } from "./moduleResolver";
import { SymbolIndex } from "./symbolIndex";
import { ExportedSymbol } from "./symbolFinder";

const RE_EXPORT_DEPTH_LIMIT = 10;

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const noopLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

interface ImportInfo {
  symbolName: string;
  originalName: string; // name in source module (handles aliased imports)
  moduleName: string;
  isDefault: boolean;
  isNamespace: boolean;
}

export function getDefinition(
  doc: TextDocument,
  position: Position,
  tsconfigResolver: TsconfigResolver,
  moduleResolver: ModuleResolver,
  symbolIndex: SymbolIndex,
  logger: Logger = noopLogger
): Location | null {
  const filePath = filePathFromUri(doc.uri);
  const content = doc.getText();
  const start = Date.now();

  logger.info(`[gotodef] Request: ${path.basename(filePath)}:${position.line + 1}:${position.character + 1}`);

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const offset = doc.offsetAt(position);
  const wordRange = getWordRangeAtOffset(content, offset);
  if (!wordRange) return null;

  const word = content.slice(wordRange.start, wordRange.end);
  if (!word) return null;

  logger.info(`[gotodef] Symbol under cursor: "${word}"`);

  // 1) Try to find an import for this symbol
  const importInfo = findImportForSymbol(sourceFile, word);

  if (importInfo) {
    logger.info(`[gotodef] Found import: "${importInfo.originalName}" from "${importInfo.moduleName}"`);

    // Resolve the module
    const config = tsconfigResolver.getConfigForFile(filePath);
    const compilerOptions = config?.compilerOptions ?? {};
    const resolved = moduleResolver.resolve(
      importInfo.moduleName,
      filePath,
      compilerOptions
    );

    if (!resolved) {
      logger.warn(`[gotodef] Module not resolved: "${importInfo.moduleName}" from ${path.basename(filePath)}`);
      return null;
    }

    logger.info(`[gotodef] Module resolved: ${resolved}`);

    // Find the symbol in the resolved file, following re-exports
    const lookupName = importInfo.isDefault
      ? "default"
      : importInfo.originalName;

    const result = resolveSymbolThroughReExports(
      resolved,
      lookupName,
      symbolIndex,
      moduleResolver,
      filePath,
      compilerOptions,
      0
    );

    if (result) {
      const elapsed = Date.now() - start;
      logger.info(`[gotodef] Resolved "${word}" → ${result.filePath}:${result.line + 1}:${result.character + 1} (${elapsed}ms)`);
      return Location.create(pathToUri(result.filePath), {
        start: { line: result.line, character: result.character },
        end: { line: result.line, character: result.character + word.length },
      });
    }

    // Fallback: jump to beginning of the resolved file
    const elapsed = Date.now() - start;
    logger.info(`[gotodef] Symbol "${lookupName}" not found in exports, falling back to file top: ${resolved} (${elapsed}ms)`);
    return Location.create(pathToUri(resolved), {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    });
  }

  // 2) Look for local definition (same file)
  const localDef = findLocalDefinition(sourceFile, word, offset);
  if (localDef) {
    const pos = sourceFile.getLineAndCharacterOfPosition(localDef);
    const elapsed = Date.now() - start;
    logger.info(`[gotodef] Local definition: "${word}" → ${path.basename(filePath)}:${pos.line + 1}:${pos.character + 1} (${elapsed}ms)`);
    return Location.create(doc.uri, {
      start: { line: pos.line, character: pos.character },
      end: { line: pos.line, character: pos.character + word.length },
    });
  }

  const elapsed = Date.now() - start;
  logger.info(`[gotodef] No definition found for "${word}" (${elapsed}ms)`);
  return null;
}

function resolveSymbolThroughReExports(
  filePath: string,
  symbolName: string,
  symbolIndex: SymbolIndex,
  moduleResolver: ModuleResolver,
  containingFile: string,
  compilerOptions: ts.CompilerOptions,
  depth: number
): { filePath: string; line: number; character: number } | null {
  if (depth > RE_EXPORT_DEPTH_LIMIT) return null;

  const sym = symbolIndex.findSymbol(filePath, symbolName);
  if (!sym) {
    // Try star re-exports
    const allExports = symbolIndex.getExports(filePath);
    const starReexports = allExports.filter(
      (e) => e.name === "*" && e.kind === "reexport" && e.moduleSpecifier
    );
    for (const star of starReexports) {
      const resolved = moduleResolver.resolve(
        star.moduleSpecifier!,
        filePath,
        compilerOptions
      );
      if (resolved) {
        const result = resolveSymbolThroughReExports(
          resolved,
          symbolName,
          symbolIndex,
          moduleResolver,
          filePath,
          compilerOptions,
          depth + 1
        );
        if (result) return result;
      }
    }
    return null;
  }

  // If it's a re-export, follow the chain
  if (sym.kind === "reexport" && sym.moduleSpecifier) {
    const resolved = moduleResolver.resolve(
      sym.moduleSpecifier,
      filePath,
      compilerOptions
    );
    if (resolved) {
      const nextName = sym.originalName === "*" ? symbolName : (sym.originalName ?? symbolName);
      const result = resolveSymbolThroughReExports(
        resolved,
        nextName,
        symbolIndex,
        moduleResolver,
        filePath,
        compilerOptions,
        depth + 1
      );
      if (result) return result;
    }
    // If chain following fails, return the re-export location itself
  }

  return { filePath, line: sym.line, character: sym.character };
}

function findImportForSymbol(
  sourceFile: ts.SourceFile,
  symbolName: string
): ImportInfo | null {
  for (const stmt of sourceFile.statements) {
    // import { X, Y as Z } from 'module'
    // import Default from 'module'
    // import * as NS from 'module'
    if (
      ts.isImportDeclaration(stmt) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.importClause
    ) {
      const moduleName = stmt.moduleSpecifier.text;
      const clause = stmt.importClause;

      // Default import: import Foo from 'module'
      if (clause.name && clause.name.text === symbolName) {
        return {
          symbolName,
          originalName: "default",
          moduleName,
          isDefault: true,
          isNamespace: false,
        };
      }

      if (clause.namedBindings) {
        // Namespace import: import * as NS from 'module'
        if (
          ts.isNamespaceImport(clause.namedBindings) &&
          clause.namedBindings.name.text === symbolName
        ) {
          return {
            symbolName,
            originalName: "*",
            moduleName,
            isDefault: false,
            isNamespace: true,
          };
        }

        // Named imports: import { X, Y as Z } from 'module'
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const spec of clause.namedBindings.elements) {
            if (spec.name.text === symbolName) {
              return {
                symbolName,
                originalName: spec.propertyName?.text ?? spec.name.text,
                moduleName,
                isDefault: false,
                isNamespace: false,
              };
            }
          }
        }
      }
    }

    // const { X } = require('module')
    if (
      ts.isVariableStatement(stmt)
    ) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          decl.initializer &&
          ts.isCallExpression(decl.initializer) &&
          ts.isIdentifier(decl.initializer.expression) &&
          decl.initializer.expression.text === "require" &&
          decl.initializer.arguments.length === 1 &&
          ts.isStringLiteral(decl.initializer.arguments[0])
        ) {
          const moduleName = (
            decl.initializer.arguments[0] as ts.StringLiteral
          ).text;

          // const X = require('module')
          if (ts.isIdentifier(decl.name) && decl.name.text === symbolName) {
            return {
              symbolName,
              originalName: "export=",
              moduleName,
              isDefault: false,
              isNamespace: true,
            };
          }

          // const { X } = require('module')
          if (ts.isObjectBindingPattern(decl.name)) {
            for (const element of decl.name.elements) {
              if (
                ts.isIdentifier(element.name) &&
                element.name.text === symbolName
              ) {
                const origName = element.propertyName && ts.isIdentifier(element.propertyName)
                  ? element.propertyName.text
                  : element.name.text;
                return {
                  symbolName,
                  originalName: origName,
                  moduleName,
                  isDefault: false,
                  isNamespace: false,
                };
              }
            }
          }
        }
      }
    }
  }

  return null;
}

function findLocalDefinition(
  sourceFile: ts.SourceFile,
  name: string,
  cursorOffset: number
): number | null {
  let result: number | null = null;

  function visit(node: ts.Node): void {
    // Don't return the cursor position itself as the definition
    const nodeStart = node.getStart(sourceFile);

    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      const nameStart = node.name.getStart(sourceFile);
      if (nameStart !== cursorOffset) {
        result = nameStart;
        return;
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      const nameStart = node.name.getStart(sourceFile);
      if (nameStart !== cursorOffset) {
        result = nameStart;
        return;
      }
    }

    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      const nameStart = node.name.getStart(sourceFile);
      if (nameStart !== cursorOffset) {
        result = nameStart;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

function getWordRangeAtOffset(
  text: string,
  offset: number
): { start: number; end: number } | null {
  if (offset < 0 || offset >= text.length) return null;

  const wordChar = /[a-zA-Z0-9_$]/;

  // Find start of word
  let start = offset;
  while (start > 0 && wordChar.test(text[start - 1])) {
    start--;
  }

  // Find end of word
  let end = offset;
  while (end < text.length && wordChar.test(text[end])) {
    end++;
  }

  if (start === end) return null;
  return { start, end };
}

function filePathFromUri(uri: string): string {
  return new URL(uri).pathname;
}

function pathToUri(filePath: string): string {
  return `file://${path.resolve(filePath)}`;
}
