import * as chokidar from "chokidar";
import * as path from "path";

export interface FileWatcherCallbacks {
  onTsFileChange(filePath: string): void;
  onTsconfigChange(filePath: string): void;
  onPackageJsonChange(filePath: string): void;
}

export class FileWatcher {
  private watcher: chokidar.FSWatcher | undefined;
  private rootPath: string;
  private callbacks: FileWatcherCallbacks;

  constructor(rootPath: string, callbacks: FileWatcherCallbacks) {
    this.rootPath = rootPath;
    this.callbacks = callbacks;
  }

  start(): void {
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

  stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }
}
