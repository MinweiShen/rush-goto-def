import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { findExports } from "../../src/server/symbolFinder";

const FIXTURE_ROOT = path.join(__dirname, "..", "fixtures", "monorepo");

function exportsFor(relPath: string) {
  const filePath = path.join(FIXTURE_ROOT, relPath);
  const content = fs.readFileSync(filePath, "utf-8");
  return findExports(filePath, content);
}

describe("symbolFinder", () => {
  it("finds direct exports (function, const) from math.ts", () => {
    const exports = exportsFor("packages/utils/src/math.ts");
    const names = exports.map((e) => e.name);

    expect(names).toContain("add");
    expect(names).toContain("subtract");
    expect(names).toContain("PI");

    for (const exp of exports) {
      expect(exp.kind).toBe("direct");
    }
  });

  it("finds re-exports from barrel file", () => {
    const exports = exportsFor("packages/utils/src/index.ts");
    const reexports = exports.filter((e) => e.kind === "reexport");

    expect(reexports.length).toBeGreaterThanOrEqual(5);
    const names = reexports.map((e) => e.name);
    expect(names).toContain("add");
    expect(names).toContain("subtract");
    expect(names).toContain("PI");
    expect(names).toContain("capitalize");
    expect(names).toContain("lowercase");

    // All should have moduleSpecifiers
    for (const exp of reexports) {
      expect(exp.moduleSpecifier).toBeDefined();
    }
  });

  it("finds interface and class exports from Input.ts", () => {
    const exports = exportsFor("packages/ui/src/Input.ts");
    const names = exports.map((e) => e.name);

    expect(names).toContain("InputProps");
    expect(names).toContain("Input");
  });

  it("finds default export from Button.tsx", () => {
    const exports = exportsFor("packages/ui/src/Button.tsx");
    const names = exports.map((e) => e.name);

    expect(names).toContain("Button");
    expect(names).toContain("ButtonProps");
    expect(names).toContain("default");
  });

  it("preserves correct line numbers", () => {
    const exports = exportsFor("packages/utils/src/math.ts");
    const addExport = exports.find((e) => e.name === "add");
    expect(addExport).toBeDefined();
    expect(addExport!.line).toBe(0); // first line (0-based)
  });

  it("handles re-exports with aliases", () => {
    const exports = exportsFor("packages/ui/src/index.ts");
    const btnProps = exports.find((e) => e.name === "BtnProps");
    expect(btnProps).toBeDefined();
    expect(btnProps!.kind).toBe("reexport");
    expect(btnProps!.originalName).toBe("ButtonProps");
  });

  it("handles star re-exports", () => {
    const filePath = path.join(FIXTURE_ROOT, "packages/app/src/reexport.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    const exports = findExports(filePath, content);

    const starExport = exports.find((e) => e.name === "*");
    expect(starExport).toBeDefined();
    expect(starExport!.kind).toBe("reexport");
    expect(starExport!.moduleSpecifier).toBe("@monorepo/utils");
  });
});
