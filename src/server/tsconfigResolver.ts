import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";

export interface ParsedConfig {
  configPath: string;
  compilerOptions: ts.CompilerOptions;
  fileNames: string[];
}

export class TsconfigResolver {
  /** tsconfig path → parsed config */
  private configCache = new Map<string, ParsedConfig>();
  /** source file → tsconfig path */
  private fileToConfig = new Map<string, string>();

  getConfigForFile(filePath: string): ParsedConfig | undefined {
    const cached = this.fileToConfig.get(filePath);
    if (cached && this.configCache.has(cached)) {
      return this.configCache.get(cached)!;
    }

    const configPath = ts.findConfigFile(
      path.dirname(filePath),
      ts.sys.fileExists,
      "tsconfig.json"
    );

    if (!configPath) return undefined;

    const resolved = path.resolve(configPath);
    this.fileToConfig.set(filePath, resolved);

    if (this.configCache.has(resolved)) {
      return this.configCache.get(resolved)!;
    }

    const parsed = this.parseConfig(resolved);
    if (parsed) {
      this.configCache.set(resolved, parsed);
    }
    return parsed;
  }

  private parseConfig(configPath: string): ParsedConfig | undefined {
    const readResult = ts.readConfigFile(configPath, (p) =>
      fs.readFileSync(p, "utf-8")
    );
    if (readResult.error) return undefined;

    const basePath = path.dirname(configPath);
    const parsed = ts.parseJsonConfigFileContent(
      readResult.config,
      ts.sys,
      basePath,
      undefined,
      configPath
    );

    return {
      configPath,
      compilerOptions: parsed.options,
      fileNames: parsed.fileNames,
    };
  }

  invalidate(configPath: string): void {
    const resolved = path.resolve(configPath);
    this.configCache.delete(resolved);
    // Clear file→config mappings that pointed to this config
    for (const [file, cfg] of this.fileToConfig) {
      if (cfg === resolved) {
        this.fileToConfig.delete(file);
      }
    }
  }
}
