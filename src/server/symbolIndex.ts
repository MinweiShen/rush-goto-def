import * as fs from "fs";
import * as path from "path";
import { ExportedSymbol, findExports } from "./symbolFinder";

interface CacheEntry {
  mtime: number;
  exports: ExportedSymbol[];
  lastAccess: number;
}

const MAX_CACHE_SIZE = 5000;

export class SymbolIndex {
  private cache = new Map<string, CacheEntry>();

  getExports(filePath: string): ExportedSymbol[] {
    const resolved = path.resolve(filePath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      this.cache.delete(resolved);
      return [];
    }

    const mtime = stat.mtimeMs;
    const cached = this.cache.get(resolved);
    if (cached && cached.mtime === mtime) {
      cached.lastAccess = Date.now();
      return cached.exports;
    }

    let content: string;
    try {
      content = fs.readFileSync(resolved, "utf-8");
    } catch {
      return [];
    }

    const exports = findExports(resolved, content);

    if (this.cache.size >= MAX_CACHE_SIZE) {
      this.evict();
    }

    this.cache.set(resolved, { mtime, exports, lastAccess: Date.now() });
    return exports;
  }

  findSymbol(filePath: string, symbolName: string): ExportedSymbol | undefined {
    const exports = this.getExports(filePath);
    return exports.find((e) => e.name === symbolName);
  }

  invalidate(filePath: string): void {
    this.cache.delete(path.resolve(filePath));
  }

  private evict(): void {
    // Remove least recently accessed entries to get back to 80% capacity
    const targetSize = MAX_CACHE_SIZE * 0.8;
    const entries = [...this.cache.entries()].sort(
      ([, a], [, b]) => a.lastAccess - b.lastAccess
    );

    while (this.cache.size > targetSize && entries.length > 0) {
      const [key] = entries.shift()!;
      this.cache.delete(key);
    }
  }
}
