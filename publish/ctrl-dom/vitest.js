// `plugins: [ctrlDom()]` in vitest.config.ts: @ctrl/dom's Vitest environment, plus every stock
// Testing Library import routed to @ctrl/dom's implementation, so existing tests run on the
// whole stack unchanged. Only @ctrl/dom needs to be installed: the environment is referenced by
// path, and the plugin answers for the name "ctrl-dom" too (per-file docblocks). Works in every
// pool: under VM pools, `@ctrl/dom` itself resolves to a bridge returning the environment's
// DOM instance (scripts/release.ts, writeBridges), so nothing here needs to be inlined.
import { fileURLToPath } from "node:url";

const environment = fileURLToPath(new URL("./dist/vitest-environment/index.js", import.meta.url));
// Agent debug mode's failure snapshots (docs/agent-debugging.md): a setup file that appends an aria
// snapshot of document.body to every failing test's error.
const failureSnapshot = fileURLToPath(new URL("./dist/vitest-environment/failure-snapshot.js", import.meta.url));
const DEBUG_FORMATS = new Set(["aria", "compact", "html"]);
const ENVIRONMENT_PACKAGE = "vitest-environment-ctrl-dom";

const TESTING_LIBRARY = [
  { find: /^@testing-library\/react(\/.*)?$/, replacement: "@ctrl/dom/react$1" },
  { find: /^@testing-library\/dom$/, replacement: "@ctrl/dom/testing-library" },
  { find: /^@testing-library\/user-event$/, replacement: "@ctrl/dom/user-event" },
  { find: /^@testing-library\/jest-dom(\/.*)?$/, replacement: "@ctrl/dom/jest-dom$1" },
];

/**
 * Turns on Node's compile cache as the worker process starts, before Vitest's own worker modules
 * load, rather than at environment setup (CtrlDomEnvironmentOptions.compileCache): Vitest's
 * runner, chai and the module runner then load from it too. A `data:` URL, so there is no file to
 * resolve. Node ignores it under NODE_DISABLE_COMPILE_CACHE (Vitest's v8 coverage sets that).
 */
const COMPILE_CACHE_IMPORT = '--import=data:text/javascript,import{enableCompileCache}from"node:module";enableCompileCache?.()';

/**
 * The Node flags the plugin adds to a project's workers (exported for comparison/, which mirrors
 * the plugin's setup without loading Vitest's config machinery).
 * @param {{ pool?: unknown, execArgv?: readonly string[], compileCache?: boolean }} project
 * @returns {string[]}
 */
export function workerExecArgv({ compileCache = false }) {
  const flags = [];
  // The same override as the environment's own compileCache option.
  const env = process.env.CTRL_DOM_COMPILE_CACHE ?? process.env.RTD_COMPILE_CACHE;
  if (env === "1" || (env !== "0" && compileCache)) flags.push(COMPILE_CACHE_IMPORT);
  // Not added: `--min-semi-space-size=16` (−7% worker CPU, +13 MB RSS per worker, no measurable
  // wall time; bench/README.md "Worker startup").
  return flags;
}

/**
 * @param {import("./vitest.d.ts").CtrlDomPluginOptions} [options]
 * @returns {import("vitest/config").Plugin}
 */
export function ctrlDom(options = {}) {
  const { testingLibrary = true, debug, ...rest } = options;
  // The compile cache pays off for @ctrl/dom's few large bundles, not for stock Testing Library's
  // many small files (CtrlDomEnvironmentOptions.compileCache).
  const environmentOptions = { compileCache: testingLibrary, ...rest };
  // Agent debug output (docs/agent-debugging.md); a CTRL_DOM_DEBUG set in the shell wins (it is
  // how `npx ctrl-dom debug` turns it on).
  const shellDebug = process.env.CTRL_DOM_DEBUG;
  const agentMode = DEBUG_FORMATS.has(String(shellDebug ?? debug ?? "").trim().toLowerCase());
  return {
    name: "@ctrl/dom",
    // Before Vite's own resolver, which would look for the package in node_modules.
    enforce: "pre",
    // `// @vitest-environment ctrl-dom` (and `environment: "ctrl-dom"`): Vitest looks a custom
    // environment name up as the package `vitest-environment-<name>`, through Vite's resolver.
    resolveId(id) {
      return id === ENVIRONMENT_PACKAGE ? environment : null;
    },
    config() {
      return {
        ...(testingLibrary ? { resolve: { alias: TESTING_LIBRARY } } : {}),
        test: {
          environment,
          environmentOptions: { "ctrl-dom": environmentOptions },
          ...(debug && shellDebug === undefined ? { env: { CTRL_DOM_DEBUG: debug } } : {}),
          // Added after the project's own setup files, so the afterEach hooks they register run first.
          ...(agentMode ? { setupFiles: [failureSnapshot] } : {}),
        },
      };
    },
    // Worker flags go on the resolved project config (a CLI `--pool` included), known only here.
    configureVitest({ project }) {
      const config = project.config;
      if (config.browser?.enabled) return;
      const flags = workerExecArgv({ pool: config.pool, execArgv: config.execArgv, compileCache: environmentOptions.compileCache === true });
      if (flags.length > 0) config.execArgv = [...(config.execArgv ?? []), ...flags];
    },
  };
}

export default ctrlDom;
