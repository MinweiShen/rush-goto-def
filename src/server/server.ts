import {
  createConnection,
  DidChangeConfigurationNotification,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDefinition, Logger } from "./definitionProvider";
import { getHover, invalidateHoverCache } from "./hoverProvider";
import { TsconfigResolver } from "./tsconfigResolver";
import { ModuleResolver } from "./moduleResolver";
import { SymbolIndex } from "./symbolIndex";
import { FileWatcher } from "./fileWatcher";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let tsconfigResolver: TsconfigResolver;
let moduleResolver: ModuleResolver;
let symbolIndex: SymbolIndex;
let fileWatcher: FileWatcher;
let logger: Logger;

const LOG_LEVELS: Record<string, number> = {
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

let currentLogLevel = LOG_LEVELS["warn"]; // default

function createLogger(): Logger {
  return {
    info: (msg: string) => {
      if (currentLogLevel >= LOG_LEVELS["info"]) connection.console.info(msg);
    },
    warn: (msg: string) => {
      if (currentLogLevel >= LOG_LEVELS["warn"]) connection.console.warn(msg);
    },
    error: (msg: string) => {
      if (currentLogLevel >= LOG_LEVELS["error"]) connection.console.error(msg);
    },
  };
}

async function updateLogLevel(): Promise<void> {
  try {
    const config = await connection.workspace.getConfiguration("rushGotoDef");
    const level = config?.logLevel ?? "warn";
    currentLogLevel = LOG_LEVELS[level] ?? LOG_LEVELS["warn"];
  } catch {
    // Config not available yet, keep default
  }
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const workspaceFolders = params.workspaceFolders ?? [];
  const rootPaths = workspaceFolders.map((f) => new URL(f.uri).pathname);
  const rootPath = rootPaths[0] ?? process.cwd();

  tsconfigResolver = new TsconfigResolver();
  moduleResolver = new ModuleResolver();
  symbolIndex = new SymbolIndex();
  logger = createLogger();
  fileWatcher = new FileWatcher(rootPath, {
    onTsFileChange(filePath: string) {
      symbolIndex.invalidate(filePath);
      moduleResolver.invalidateFile(filePath);
      invalidateHoverCache(filePath);
      logger.info(`[filewatcher] TS file changed: ${filePath}`);
    },
    onTsconfigChange(filePath: string) {
      // "__all__" is a sentinel for full invalidation after Rush build
      if (filePath === "__all__") {
        tsconfigResolver = new TsconfigResolver();
        moduleResolver.invalidateAll();
        symbolIndex.invalidateAll();
        invalidateHoverCache();
        logger.info("[filewatcher] Full cache invalidation after Rush build");
        return;
      }
      tsconfigResolver.invalidate(filePath);
      moduleResolver.invalidateAll();
      invalidateHoverCache();
      logger.info(`[filewatcher] tsconfig changed: ${filePath}`);
    },
    onPackageJsonChange(filePath: string) {
      moduleResolver.invalidateAll();
      invalidateHoverCache();
      logger.info(`[filewatcher] package.json changed: ${filePath}`);
    },
    onRushBuildStart() {
      logger.info("[filewatcher] Rush build detected, pausing file watcher");
    },
    onRushBuildEnd() {
      logger.info("[filewatcher] Rush build finished, resuming file watcher");
    },
  });

  connection.console.info(
    `Rush Go to Definition server initialized. Root: ${rootPath}`
  );

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      hoverProvider: true,
    },
  };
});

connection.onInitialized(async () => {
  connection.client.register(DidChangeConfigurationNotification.type);
  await updateLogLevel();
  fileWatcher.start();
  connection.console.info("[server] File watcher started.");
});

connection.onDidChangeConfiguration(async () => {
  await updateLogLevel();
  logger.info(`[server] Log level changed to: ${Object.entries(LOG_LEVELS).find(([, v]) => v === currentLogLevel)?.[0] ?? "warn"}`);
});

connection.onDefinition(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  try {
    return getDefinition(
      doc,
      params.position,
      tsconfigResolver,
      moduleResolver,
      symbolIndex,
      logger
    );
  } catch (err) {
    connection.console.error(
      `Definition error: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
});

connection.onHover(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  try {
    return getHover(doc, params.position, tsconfigResolver, logger);
  } catch (err) {
    connection.console.error(
      `Hover error: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
});

connection.onShutdown(() => {
  fileWatcher.stop();
});

documents.listen(connection);
connection.listen();
