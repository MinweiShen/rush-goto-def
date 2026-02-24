import { describe, it, expect } from "vitest";
import * as path from "path";
import { ModuleResolver } from "../../src/server/moduleResolver";
import { TsconfigResolver } from "../../src/server/tsconfigResolver";

const FIXTURE_ROOT = path.join(__dirname, "..", "fixtures", "monorepo");

describe("ModuleResolver", () => {
  const tsconfigResolver = new TsconfigResolver();
  const moduleResolver = new ModuleResolver();

  function getOptions(filePath: string) {
    return tsconfigResolver.getConfigForFile(filePath)?.compilerOptions ?? {};
  }

  it("resolves relative imports", () => {
    const containingFile = path.join(
      FIXTURE_ROOT,
      "packages/utils/src/index.ts"
    );
    const result = moduleResolver.resolve(
      "./math",
      containingFile,
      getOptions(containingFile)
    );

    expect(result).toBeDefined();
    expect(result!).toContain("math.ts");
  });

  it("resolves path alias @monorepo/utils", () => {
    const containingFile = path.join(
      FIXTURE_ROOT,
      "packages/app/src/main.ts"
    );
    const result = moduleResolver.resolve(
      "@monorepo/utils",
      containingFile,
      getOptions(containingFile)
    );

    expect(result).toBeDefined();
    expect(result!).toContain("utils");
    expect(result!).toContain("index.ts");
  });

  it("resolves path alias @monorepo/ui", () => {
    const containingFile = path.join(
      FIXTURE_ROOT,
      "packages/app/src/main.ts"
    );
    const result = moduleResolver.resolve(
      "@monorepo/ui",
      containingFile,
      getOptions(containingFile)
    );

    expect(result).toBeDefined();
    expect(result!).toContain("ui");
    expect(result!).toContain("index.ts");
  });

  it("caches resolved modules", () => {
    const containingFile = path.join(
      FIXTURE_ROOT,
      "packages/utils/src/index.ts"
    );
    const opts = getOptions(containingFile);
    const r1 = moduleResolver.resolve("./math", containingFile, opts);
    const r2 = moduleResolver.resolve("./math", containingFile, opts);
    expect(r1).toBe(r2);
  });

  it("invalidateFile clears relevant cache entries", () => {
    const resolver = new ModuleResolver();
    const containingFile = path.join(
      FIXTURE_ROOT,
      "packages/utils/src/index.ts"
    );
    const opts = getOptions(containingFile);

    resolver.resolve("./math", containingFile, opts);
    resolver.invalidateFile(containingFile);
    // After invalidation, re-resolving should still work
    const result = resolver.resolve("./math", containingFile, opts);
    expect(result).toBeDefined();
  });

  it("returns undefined for non-existent modules", () => {
    const containingFile = path.join(
      FIXTURE_ROOT,
      "packages/app/src/main.ts"
    );
    const result = moduleResolver.resolve(
      "./nonexistent",
      containingFile,
      getOptions(containingFile)
    );
    expect(result).toBeUndefined();
  });

  it("maps .d.ts to source .ts when dist/ and src/ both exist", () => {
    const resolver = new ModuleResolver();
    // Resolve from a file that would hit the dist/index.d.ts
    // We simulate this by resolving a relative import from within dist/
    const containingFile = path.join(
      FIXTURE_ROOT,
      "packages/utils/dist/index.d.ts"
    );
    const result = resolver.resolve(
      "./math",
      containingFile,
      getOptions(path.join(FIXTURE_ROOT, "packages/utils/src/index.ts"))
    );

    expect(result).toBeDefined();
    // Should resolve to src/math.ts, NOT dist/math.d.ts
    expect(result!).toContain("src");
    expect(result!).toContain("math.ts");
    expect(result!).not.toContain(".d.ts");
  });

  it("maps .d.ts to source .ts with nested output subdirs (dist/cjs)", () => {
    const resolver = new ModuleResolver();
    const containingFile = path.join(
      FIXTURE_ROOT,
      "packages/utils/dist/cjs/index.d.ts"
    );
    const result = resolver.resolve(
      "./math",
      containingFile,
      getOptions(path.join(FIXTURE_ROOT, "packages/utils/src/index.ts"))
    );

    expect(result).toBeDefined();
    // Should resolve to src/math.ts, NOT dist/cjs/math.d.ts
    expect(result!).toContain("src");
    expect(result!).toContain("math.ts");
    expect(result!).not.toContain(".d.ts");
    expect(result!).not.toContain("cjs");
  });
});
