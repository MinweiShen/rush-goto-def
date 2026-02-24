import { createRequire } from "module";
import { mkdirSync, writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const sharedOptions = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  logLevel: "info",
  minify: !watch,
};

// Client bundle — vscode is external (provided by the host)
const clientBuild = esbuild[watch ? "context" : "build"]({
  ...sharedOptions,
  entryPoints: ["src/client/extension.ts"],
  outfile: "dist/client/extension.js",
  external: ["vscode"],
});

// Server bundle — typescript is external (copied separately to reduce bundle size)
const serverBuild = esbuild[watch ? "context" : "build"]({
  ...sharedOptions,
  entryPoints: ["src/server/server.ts"],
  outfile: "dist/server/server.js",
  external: ["typescript"],
});

if (watch) {
  const [clientCtx, serverCtx] = await Promise.all([clientBuild, serverBuild]);
  await Promise.all([clientCtx.watch(), serverCtx.watch()]);
  console.log("[watch] Watching for changes...");
} else {
  await Promise.all([clientBuild, serverBuild]);

  // Copy typescript as a minified standalone file for the packaged extension.
  // At runtime, require("typescript") resolves to dist/server/node_modules/typescript.
  const tsOutDir = "dist/server/node_modules/typescript";
  mkdirSync(`${tsOutDir}/lib`, { recursive: true });
  await esbuild.build({
    entryPoints: ["node_modules/typescript/lib/typescript.js"],
    outfile: `${tsOutDir}/lib/typescript.js`,
    bundle: false,
    minify: true,
    platform: "node",
  });
  writeFileSync(
    `${tsOutDir}/package.json`,
    '{"name":"typescript","main":"lib/typescript.js"}'
  );

  console.log("Build complete.");
}
