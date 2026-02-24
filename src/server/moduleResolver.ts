import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

const BUILD_SUBDIRS = new Set(["cjs", "esm", "mjs", "commonjs", "types", "typings", "module"]);

export class ModuleResolver {
  /** `${containingFile}::${moduleName}` → resolved file path */
  private cache = new Map<string, string | null>();

  private host: ts.ModuleResolutionHost = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    realpath: ts.sys.realpath,
    getDirectories: ts.sys.getDirectories,
    getCurrentDirectory: () => process.cwd(),
  };

  resolve(
    moduleName: string,
    containingFile: string,
    compilerOptions: ts.CompilerOptions
  ): string | undefined {
    const key = `${containingFile}::${moduleName}`;
    if (this.cache.has(key)) {
      return this.cache.get(key) ?? undefined;
    }

    const result = ts.resolveModuleName(
      moduleName,
      containingFile,
      compilerOptions,
      this.host
    );

    const resolvedPath = result.resolvedModule?.resolvedFileName;

    // Resolve symlinks (important for Rush/pnpm)
    let finalPath: string | undefined;
    if (resolvedPath) {
      try {
        finalPath = fs.realpathSync(resolvedPath);
      } catch {
        finalPath = resolvedPath;
      }

      // If resolved to a .d.ts, try to find the real .ts source
      if (finalPath.endsWith(".d.ts") || finalPath.endsWith(".d.tsx")) {
        const sourcePath = this.findSourceForDts(finalPath);
        if (sourcePath) {
          finalPath = sourcePath;
        }
      }
    }

    this.cache.set(key, finalPath ?? null);
    return finalPath;
  }

  invalidateFile(filePath: string): void {
    const resolved = path.resolve(filePath);
    for (const [key, value] of this.cache) {
      if (value === resolved || key.startsWith(resolved + "::")) {
        this.cache.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Given a .d.ts path, try to find the original .ts/.tsx source file.
   *
   * Strategies:
   * 1. Same directory: foo.d.ts → foo.ts / foo.tsx
   * 2. Output→source directory mapping: dist/foo.d.ts → src/foo.ts
   *    Checks common output dirs: dist, lib, build, out, output
   * 3. Package.json-relative: find package root, then try src/ parallel
   */
  private findSourceForDts(dtsPath: string): string | undefined {
    // Strategy 1: same directory — foo.d.ts → foo.ts or foo.tsx
    const base = dtsPath.replace(/\.d\.(ts|tsx)$/, "");
    for (const ext of [".ts", ".tsx"]) {
      const candidate = base + ext;
      if (candidate !== dtsPath && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Strategy 2: swap output dir for source dir
    const OUTPUT_DIRS = ["dist", "lib", "build", "out", "output"];
    const normalized = dtsPath.replace(/\\/g, "/");
    for (const outDir of OUTPUT_DIRS) {
      const pattern = `/${outDir}/`;
      const idx = normalized.lastIndexOf(pattern);
      if (idx !== -1) {
        const before = dtsPath.substring(0, idx);
        const after = dtsPath.substring(idx + pattern.length);
        const sourceRelative = after.replace(/\.d\.(ts|tsx)$/, "");
        for (const ext of [".ts", ".tsx"]) {
          const candidate = path.join(before, "src", sourceRelative + ext);
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
        // Strip build sub-dirs (cjs, esm, etc.) from the remaining path
        // e.g. dist/cjs/utils/foo.d.ts → src/utils/foo.ts
        const parts = sourceRelative.split(path.sep);
        if (parts.length > 1 && BUILD_SUBDIRS.has(parts[0])) {
          const stripped = parts.slice(1).join(path.sep);
          for (const ext of [".ts", ".tsx"]) {
            const candidate = path.join(before, "src", stripped + ext);
            if (fs.existsSync(candidate)) {
              return candidate;
            }
          }
        }
      }
    }

    // Strategy 3: walk up to package.json root, try src/ mirror
    const pkgRoot = this.findPackageRoot(dtsPath);
    if (pkgRoot) {
      const relative = path.relative(pkgRoot, base);
      // Strip leading output dir from relative path (e.g. "dist/utils/foo" → "utils/foo")
      const parts = relative.split(path.sep);
      let strippedParts =
        OUTPUT_DIRS.includes(parts[0]) ? parts.slice(1) : parts;
      // Strip build sub-dir (cjs, esm, etc.)
      if (strippedParts.length > 1 && BUILD_SUBDIRS.has(strippedParts[0])) {
        strippedParts = strippedParts.slice(1);
      }
      const stripped = strippedParts.join(path.sep);
      for (const ext of [".ts", ".tsx"]) {
        const candidate = path.join(pkgRoot, "src", stripped + ext);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }

    return undefined;
  }

  private findPackageRoot(filePath: string): string | undefined {
    let dir = path.dirname(filePath);
    const root = path.parse(dir).root;
    while (dir !== root) {
      if (fs.existsSync(path.join(dir, "package.json"))) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    return undefined;
  }
}
