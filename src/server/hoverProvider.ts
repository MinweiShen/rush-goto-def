import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { Hover, Position, MarkupKind } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TsconfigResolver, ParsedConfig } from "./tsconfigResolver";
import { Logger } from "./definitionProvider";

// Cache language services per tsconfig path
const languageServiceCache = new Map<string, ts.LanguageService>();
// Track file versions for the language service
const fileVersions = new Map<string, number>();

export function getHover(
  doc: TextDocument,
  position: Position,
  tsconfigResolver: TsconfigResolver,
  logger: Logger
): Hover | null {
  const filePath = filePathFromUri(doc.uri);
  const content = doc.getText();
  const offset = doc.offsetAt(position);
  const start = Date.now();

  logger.info(`[hover] Request: ${path.basename(filePath)}:${position.line + 1}:${position.character + 1}`);

  // Get or create language service for this file's tsconfig
  const config = tsconfigResolver.getConfigForFile(filePath);
  const languageService = getOrCreateLanguageService(filePath, content, config);

  // Get quick info at position
  const quickInfo = languageService.getQuickInfoAtPosition(filePath, offset);
  if (!quickInfo) {
    logger.info(`[hover] No info found (${Date.now() - start}ms)`);
    return null;
  }

  // Format the hover content
  const displayParts = quickInfo.displayParts?.map((p) => p.text).join("") ?? "";
  const documentation = quickInfo.documentation?.map((p) => p.text).join("\n") ?? "";
  const tags = formatTags(quickInfo.tags);

  if (!displayParts) {
    return null;
  }

  const contents: string[] = ["```typescript", displayParts, "```"];
  if (documentation) {
    contents.push("", documentation);
  }
  if (tags) {
    contents.push("", tags);
  }

  const elapsed = Date.now() - start;
  logger.info(`[hover] Found: "${displayParts.slice(0, 50)}${displayParts.length > 50 ? "..." : ""}" (${elapsed}ms)`);

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: contents.join("\n"),
    },
  };
}

function getOrCreateLanguageService(
  filePath: string,
  content: string,
  config: ParsedConfig | undefined
): ts.LanguageService {
  const configPath = config ? findConfigPath(filePath) : "default";
  const cacheKey = configPath;

  // Update file version
  const currentVersion = fileVersions.get(filePath) ?? 0;
  fileVersions.set(filePath, currentVersion + 1);

  let service = languageServiceCache.get(cacheKey);
  if (service) {
    return service;
  }

  const compilerOptions = config?.compilerOptions ?? {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    allowJs: true,
    checkJs: false,
    strict: false,
  };

  // Get the list of files from tsconfig, or just use the current file
  const rootFiles = config?.fileNames ?? [filePath];
  // Make sure current file is included
  if (!rootFiles.includes(filePath)) {
    rootFiles.push(filePath);
  }

  const host = createLanguageServiceHost(rootFiles, compilerOptions, filePath, content);
  service = ts.createLanguageService(host, ts.createDocumentRegistry());
  languageServiceCache.set(cacheKey, service);

  return service;
}

function createLanguageServiceHost(
  rootFiles: string[],
  compilerOptions: ts.CompilerOptions,
  currentFile: string,
  currentContent: string
): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => rootFiles,
    getScriptVersion: (fileName) => {
      return (fileVersions.get(fileName) ?? 0).toString();
    },
    getScriptSnapshot: (fileName) => {
      // Use provided content for the current file
      if (fileName === currentFile) {
        return ts.ScriptSnapshot.fromString(currentContent);
      }

      // Read from disk for other files
      try {
        if (fs.existsSync(fileName)) {
          const content = fs.readFileSync(fileName, "utf-8");
          return ts.ScriptSnapshot.fromString(content);
        }
      } catch {
        // Ignore read errors
      }
      return undefined;
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
}

function findConfigPath(filePath: string): string {
  let dir = path.dirname(filePath);
  const root = path.parse(dir).root;
  while (dir !== root) {
    const configPath = path.join(dir, "tsconfig.json");
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    dir = path.dirname(dir);
  }
  return "default";
}

function formatTags(tags: ts.JSDocTagInfo[] | undefined): string {
  if (!tags || tags.length === 0) return "";

  return tags
    .map((tag) => {
      const text = tag.text?.map((p) => p.text).join("") ?? "";
      if (tag.name === "param") {
        return `*@${tag.name}* ${text}`;
      }
      if (tag.name === "returns" || tag.name === "return") {
        return `*@returns* ${text}`;
      }
      if (text) {
        return `*@${tag.name}* ${text}`;
      }
      return `*@${tag.name}*`;
    })
    .join("\n\n");
}

function filePathFromUri(uri: string): string {
  return new URL(uri).pathname;
}

export function invalidateHoverCache(filePath?: string): void {
  if (filePath) {
    // Increment version to invalidate cached data for this file
    const currentVersion = fileVersions.get(filePath) ?? 0;
    fileVersions.set(filePath, currentVersion + 1);
  }
  // Clear all language services - they'll be recreated on next request
  languageServiceCache.clear();
}
