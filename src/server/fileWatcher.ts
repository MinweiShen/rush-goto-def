import * as chokidar from "chokidar";
import * as path from "path";
import * as fs from "fs";

export interface FileWatcherCallbacks {
  onTsFileChange(filePath: string): void;
  onTsconfigChange(filePath: string): void;
  onPackageJsonChange(filePath: string): void;
  onRushBuildStart?(): void;
  onRushBuildEnd?(): void;
}

// Rush lock file that indicates a build is in progress
const RUSH_LOCK_FILE = "common/temp/rush-lock.txt";

export class FileWatcher {
  private watcher: chokidar.FSWatcher | undefined;
  private rushWatcher: chokidar.FSWatcher | undefined;
  private rootPath: string;
  private rushRootPath: string | undefined;
  private callbacks: FileWatcherCallbacks;
  private isPaused = false;
  private pendingInvalidateAll = false;
  private rushLockCheckInterval: NodeJS.Timeout | undefined;

  constructor(rootPath: string, callbacks: FileWatcherCallbacks) {
    this.rootPath = rootPath;
    this.rushRootPath = this.findRushRoot(rootPath);
    this.callbacks = callbacks;
  }

  /**
   * Find the Rush repo root by looking for rush.json up the directory tree
   */
  private findRushRoot(startPath: string): string | undefined {
    let dir = path.resolve(startPath);
    const root = path.parse(dir).root;

    while (dir !== root) {
      const rushJsonPath = path.join(dir, "rush.json");
      if (fs.existsSync(rushJsonPath)) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    return undefined;
  }

  start(): void {
    this.startFileWatcher();
    this.startRushDetection();
  }

  private startFileWatcher(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(
      [
        path.join(this.rootPath, "**/*.{ts,tsx,d.ts}"),
        path.join(this.rootPath, "**/tsconfig.json"),
        path.join(this.rootPath, "**/package.json"),
      ],
      {
        ignored: [
          "**/node_modules/.cache/**",
          "**/dist/**",
          "**/build/**",
          "**/.git/**",
          "**/common/temp/**",
        ],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      }
    );

    const handleChange = (filePath: string) => {
      if (this.isPaused) {
        // Mark that we need to invalidate everything when Rush finishes
        this.pendingInvalidateAll = true;
        return;
      }

      const resolved = path.resolve(filePath);
      const basename = path.basename(resolved);

      if (basename === "tsconfig.json") {
        this.callbacks.onTsconfigChange(resolved);
      } else if (basename === "package.json") {
        this.callbacks.onPackageJsonChange(resolved);
      } else {
        this.callbacks.onTsFileChange(resolved);
      }
    };

    this.watcher.on("change", handleChange);
    this.watcher.on("add", handleChange);
    this.watcher.on("unlink", handleChange);
  }

  private stopFileWatcher(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private startRushDetection(): void {
    // If no Rush root found, skip Rush detection
    if (!this.rushRootPath) {
      return;
    }

    const rushLockPath = path.join(this.rushRootPath, RUSH_LOCK_FILE);

    // Check if rush lock exists initially
    if (fs.existsSync(rushLockPath)) {
      this.onRushStart();
    }

    // Watch for the rush lock file
    this.rushWatcher = chokidar.watch(rushLockPath, {
      persistent: true,
      ignoreInitial: true,
    });

    this.rushWatcher.on("add", () => this.onRushStart());
    this.rushWatcher.on("unlink", () => this.onRushEnd());

    // Also poll periodically as a fallback (lock file detection can be unreliable)
    this.rushLockCheckInterval = setInterval(() => {
      const lockExists = fs.existsSync(rushLockPath);
      if (lockExists && !this.isPaused) {
        this.onRushStart();
      } else if (!lockExists && this.isPaused) {
        this.onRushEnd();
      }
    }, 2000);
  }

  private onRushStart(): void {
    if (this.isPaused) return;

    this.isPaused = true;
    this.pendingInvalidateAll = false;
    this.callbacks.onRushBuildStart?.();
  }

  private onRushEnd(): void {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.callbacks.onRushBuildEnd?.();

    // Invalidate all caches since many files likely changed
    if (this.pendingInvalidateAll) {
      this.pendingInvalidateAll = false;
      // Trigger a full invalidation by calling the callbacks with a sentinel
      this.callbacks.onTsconfigChange("__all__");
    }
  }

  stop(): void {
    this.stopFileWatcher();
    this.rushWatcher?.close();
    this.rushWatcher = undefined;
    if (this.rushLockCheckInterval) {
      clearInterval(this.rushLockCheckInterval);
      this.rushLockCheckInterval = undefined;
    }
  }

  /** Returns true if watching is paused due to Rush running */
  get paused(): boolean {
    return this.isPaused;
  }
}
