import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDefinition } from "../../src/server/definitionProvider";
import { TsconfigResolver } from "../../src/server/tsconfigResolver";
import { ModuleResolver } from "../../src/server/moduleResolver";
import { SymbolIndex } from "../../src/server/symbolIndex";

const FIXTURE_ROOT = path.join(__dirname, "..", "fixtures", "monorepo");

function createDoc(relPath: string): TextDocument {
  const filePath = path.join(FIXTURE_ROOT, relPath);
  const content = fs.readFileSync(filePath, "utf-8");
  return TextDocument.create(`file://${filePath}`, "typescript", 1, content);
}

function positionOfWord(
  doc: TextDocument,
  word: string,
  occurrence: number = 1
): { line: number; character: number } {
  const text = doc.getText();
  let idx = -1;
  for (let i = 0; i < occurrence; i++) {
    idx = text.indexOf(word, idx + 1);
    if (idx === -1) throw new Error(`Word "${word}" occurrence ${occurrence} not found`);
  }
  return doc.positionAt(idx);
}

describe("definitionProvider", () => {
  const tsconfigResolver = new TsconfigResolver();
  const moduleResolver = new ModuleResolver();
  const symbolIndex = new SymbolIndex();

  it("resolves imported symbol through path alias and barrel file", () => {
    const doc = createDoc("packages/app/src/main.ts");
    // Click on "add" in `const result = add(1, 2)`
    const pos = positionOfWord(doc, "add", 2); // 2nd occurrence (skip import)

    const result = getDefinition(
      doc,
      pos,
      tsconfigResolver,
      moduleResolver,
      symbolIndex
    );

    expect(result).not.toBeNull();
    // Should resolve to math.ts where add is actually defined
    expect(result!.uri).toContain("math.ts");
  });

  it("resolves imported symbol to correct file via re-export chain", () => {
    const doc = createDoc("packages/app/src/main.ts");
    // Click on "capitalize" usage
    const pos = positionOfWord(doc, "capitalize", 2);

    const result = getDefinition(
      doc,
      pos,
      tsconfigResolver,
      moduleResolver,
      symbolIndex
    );

    expect(result).not.toBeNull();
    expect(result!.uri).toContain("string.ts"); // should follow through barrel
  });

  it("resolves Button import through barrel file", () => {
    const doc = createDoc("packages/app/src/main.ts");
    // Click on "Button" usage (2nd occurrence, after the import)
    const pos = positionOfWord(doc, "Button", 2);

    const result = getDefinition(
      doc,
      pos,
      tsconfigResolver,
      moduleResolver,
      symbolIndex
    );

    expect(result).not.toBeNull();
    expect(result!.uri).toContain("Button.tsx");
  });

  it("resolves local definitions in same file", () => {
    const doc = createDoc("packages/app/src/local.ts");
    // Click on "helperFunction" usage (2nd occurrence = the call)
    const pos = positionOfWord(doc, "helperFunction", 2);

    const result = getDefinition(
      doc,
      pos,
      tsconfigResolver,
      moduleResolver,
      symbolIndex
    );

    expect(result).not.toBeNull();
    expect(result!.uri).toContain("local.ts");
    expect(result!.range.start.line).toBe(0); // defined on first line
  });

  it("resolves const PI through barrel re-export", () => {
    const doc = createDoc("packages/app/src/main.ts");
    // Click on "PI" usage
    const pos = positionOfWord(doc, "PI", 2);

    const result = getDefinition(
      doc,
      pos,
      tsconfigResolver,
      moduleResolver,
      symbolIndex
    );

    expect(result).not.toBeNull();
    expect(result!.uri).toContain("math.ts");
  });

  it("returns null for unknown symbols", () => {
    const doc = createDoc("packages/app/src/main.ts");
    // Position at an empty area or number — won't match
    const result = getDefinition(
      doc,
      { line: 3, character: 25 }, // points at "1," which is not an identifier
      tsconfigResolver,
      moduleResolver,
      symbolIndex
    );

    // Should return null for non-identifiers
    expect(result).toBeNull();
  });
});
