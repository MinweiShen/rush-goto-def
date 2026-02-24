import { describe, it, expect } from "vitest";
import * as path from "path";
import { SymbolIndex } from "../../src/server/symbolIndex";

const FIXTURE_ROOT = path.join(__dirname, "..", "fixtures", "monorepo");

describe("SymbolIndex", () => {
  it("returns exports for a file", () => {
    const index = new SymbolIndex();
    const exports = index.getExports(
      path.join(FIXTURE_ROOT, "packages/utils/src/math.ts")
    );

    expect(exports.length).toBeGreaterThan(0);
    const names = exports.map((e) => e.name);
    expect(names).toContain("add");
  });

  it("findSymbol returns the correct symbol", () => {
    const index = new SymbolIndex();
    const sym = index.findSymbol(
      path.join(FIXTURE_ROOT, "packages/utils/src/math.ts"),
      "add"
    );

    expect(sym).toBeDefined();
    expect(sym!.name).toBe("add");
    expect(sym!.kind).toBe("direct");
  });

  it("caches results by mtime", () => {
    const index = new SymbolIndex();
    const filePath = path.join(FIXTURE_ROOT, "packages/utils/src/math.ts");

    const r1 = index.getExports(filePath);
    const r2 = index.getExports(filePath);
    expect(r1).toBe(r2); // same reference = cached
  });

  it("invalidate clears cache", () => {
    const index = new SymbolIndex();
    const filePath = path.join(FIXTURE_ROOT, "packages/utils/src/math.ts");

    const r1 = index.getExports(filePath);
    index.invalidate(filePath);
    const r2 = index.getExports(filePath);

    expect(r2).not.toBe(r1);
    expect(r2.length).toBe(r1.length); // same content though
  });

  it("returns empty for non-existent files", () => {
    const index = new SymbolIndex();
    const exports = index.getExports("/nonexistent/file.ts");
    expect(exports).toEqual([]);
  });
});
