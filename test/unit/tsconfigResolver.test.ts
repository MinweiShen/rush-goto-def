import { describe, it, expect } from "vitest";
import * as path from "path";
import { TsconfigResolver } from "../../src/server/tsconfigResolver";

const FIXTURE_ROOT = path.join(__dirname, "..", "fixtures", "monorepo");

describe("TsconfigResolver", () => {
  it("finds tsconfig for a file in packages/app", () => {
    const resolver = new TsconfigResolver();
    const filePath = path.join(FIXTURE_ROOT, "packages/app/src/main.ts");
    const config = resolver.getConfigForFile(filePath);

    expect(config).toBeDefined();
    expect(config!.configPath).toContain("packages/app/tsconfig.json");
    expect(config!.compilerOptions).toBeDefined();
  });

  it("resolves paths aliases from extended root tsconfig", () => {
    const resolver = new TsconfigResolver();
    const filePath = path.join(FIXTURE_ROOT, "packages/app/src/main.ts");
    const config = resolver.getConfigForFile(filePath);

    expect(config).toBeDefined();
    const paths = config!.compilerOptions.paths;
    expect(paths).toBeDefined();
    expect(paths!["@monorepo/ui"]).toBeDefined();
    expect(paths!["@monorepo/utils"]).toBeDefined();
  });

  it("caches parsed configs", () => {
    const resolver = new TsconfigResolver();
    const filePath = path.join(FIXTURE_ROOT, "packages/app/src/main.ts");
    const config1 = resolver.getConfigForFile(filePath);
    const config2 = resolver.getConfigForFile(filePath);

    expect(config1).toBe(config2); // same reference = cached
  });

  it("invalidates cache", () => {
    const resolver = new TsconfigResolver();
    const filePath = path.join(FIXTURE_ROOT, "packages/app/src/main.ts");
    const config1 = resolver.getConfigForFile(filePath);

    resolver.invalidate(
      path.join(FIXTURE_ROOT, "packages/app/tsconfig.json")
    );

    const config2 = resolver.getConfigForFile(filePath);
    expect(config2).toBeDefined();
    expect(config2).not.toBe(config1); // new object after invalidation
  });

  it("returns undefined for files with no tsconfig", () => {
    const resolver = new TsconfigResolver();
    const config = resolver.getConfigForFile("/nonexistent/path/file.ts");
    expect(config).toBeUndefined();
  });
});
