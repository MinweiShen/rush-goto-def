import * as esbuild from "esbuild";

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

// Server bundle — everything bundled except node built-ins
const serverBuild = esbuild[watch ? "context" : "build"]({
  ...sharedOptions,
  entryPoints: ["src/server/server.ts"],
  outfile: "dist/server/server.js",
  external: [],
});

if (watch) {
  const [clientCtx, serverCtx] = await Promise.all([clientBuild, serverBuild]);
  await Promise.all([clientCtx.watch(), serverCtx.watch()]);
  console.log("[watch] Watching for changes...");
} else {
  await Promise.all([clientBuild, serverBuild]);
  console.log("Build complete.");
}
