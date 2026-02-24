import * as ts from "typescript";
import * as fs from "fs";

export interface ExportedSymbol {
  name: string;
  line: number;      // 0-based
  character: number; // 0-based
  kind: "direct" | "reexport" | "default";
  /** For re-exports: the module specifier to follow */
  moduleSpecifier?: string;
  /** For re-exports with aliases: the original name in the source module */
  originalName?: string;
}

export function findExports(filePath: string, content: string): ExportedSymbol[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const exports: ExportedSymbol[] = [];

  function getPos(node: ts.Node): { line: number; character: number } {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile)
    );
    return { line, character };
  }

  function hasExportModifier(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      (ts.getModifiers(node)?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      ) ?? false)
    );
  }

  function visit(node: ts.Node): void {
    // export function foo() / export class Foo / export interface Foo / export enum Foo
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
      hasExportModifier(node) &&
      node.name
    ) {
      const isDefault =
        ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some(
          (m) => m.kind === ts.SyntaxKind.DefaultKeyword
        );
      exports.push({
        name: node.name.text,
        ...getPos(node.name),
        kind: isDefault ? "default" : "direct",
      });
    }

    // export const/let/var foo = ...
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          exports.push({
            name: decl.name.text,
            ...getPos(decl.name),
            kind: "direct",
          });
        }
      }
    }

    // export default expression
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      exports.push({
        name: "default",
        ...getPos(node),
        kind: "default",
      });
    }

    // export = expression
    if (ts.isExportAssignment(node) && node.isExportEquals) {
      exports.push({
        name: "export=",
        ...getPos(node),
        kind: "direct",
      });
    }

    // export { X, Y as Z } from './module'  OR  export { X, Y as Z }
    if (ts.isExportDeclaration(node)) {
      const moduleSpec = node.moduleSpecifier;
      const specifierText =
        moduleSpec && ts.isStringLiteral(moduleSpec)
          ? moduleSpec.text
          : undefined;

      // export * from './module'
      if (!node.exportClause) {
        if (specifierText) {
          exports.push({
            name: "*",
            ...getPos(node),
            kind: "reexport",
            moduleSpecifier: specifierText,
          });
        }
        return;
      }

      // Named exports: export { X, Y as Z }
      if (ts.isNamedExports(node.exportClause)) {
        for (const spec of node.exportClause.elements) {
          const exportedName = spec.name.text;
          const originalName = spec.propertyName?.text ?? spec.name.text;

          if (specifierText) {
            // re-export from another module
            exports.push({
              name: exportedName,
              ...getPos(spec.name),
              kind: "reexport",
              moduleSpecifier: specifierText,
              originalName,
            });
          } else {
            // local re-export: export { localVar as ExportedName }
            exports.push({
              name: exportedName,
              ...getPos(spec.name),
              kind: "direct",
              originalName: spec.propertyName ? originalName : undefined,
            });
          }
        }
      }

      // export * as ns from './module'
      if (ts.isNamespaceExport(node.exportClause) && specifierText) {
        exports.push({
          name: node.exportClause.name.text,
          ...getPos(node.exportClause.name),
          kind: "reexport",
          moduleSpecifier: specifierText,
          originalName: "*",
        });
      }
    }

    // Handle: export default function foo() / export default class Foo
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      hasExportModifier(node) &&
      ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword
      )
    ) {
      // Already handled above for named defaults, add a "default" alias
      if (node.name) {
        const alreadyHasDefault = exports.some(
          (e) => e.name === "default" && e.kind === "default"
        );
        if (!alreadyHasDefault) {
          exports.push({
            name: "default",
            ...getPos(node.name),
            kind: "default",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return exports;
}
