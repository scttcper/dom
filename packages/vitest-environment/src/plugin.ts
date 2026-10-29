// `plugins: [ctrlDom()]` in vitest.config.ts, published as `@ctrl/dom/vitest`: @ctrl/dom's Vitest
// environment, plus every stock Testing Library import routed to @ctrl/dom's implementation, so
// existing tests run on the whole stack unchanged. Only @ctrl/dom needs to be installed: the
// environment is referenced by path, and the plugin answers for the name "ctrl-dom" too (per-file
// docblocks). Works in every pool: under VM pools, `@ctrl/dom` itself resolves to a bridge
// returning the environment's DOM instance (scripts/release.ts, writeBridges), so nothing here
// needs to be inlined.

import { fileURLToPath } from "node:url";
import type { Plugin } from "vitest/config";
import type { CtrlDomEnvironmentOptions } from "./index.ts";

export type { CtrlDomEnvironmentOptions };

export interface CtrlDomPluginOptions extends CtrlDomEnvironmentOptions {
  /**
   * Route stock `@testing-library/react`, `/dom`, `/user-event` and `/jest-dom` imports to
   * @ctrl/dom's implementations (default true). `false` swaps only the DOM.
   */
  testingLibrary?: boolean;
  /**
   * Agent-oriented debug output, the same as the `CTRL_DOM_DEBUG` env var (which wins when set):
   * `"aria"` prints accessibility snapshots instead of HTML in `screen.debug()`, `prettyDOM` and
   * failing query errors (with the closest matching elements); `"compact"` prints HTML without
   * class/style attributes and SVG internals. Default: upstream output.
   *
   * When on (here or through `CTRL_DOM_DEBUG`), the plugin also adds a setup file that appends a
   * snapshot of `document.body` to every failing test's error, taken before cleanup.
   */
  debug?: "aria" | "compact";
}

// The environment and agent debug mode's failure snapshots (docs/agent-debugging.md: a setup file
// that appends an aria snapshot of document.body to every failing test's error), next to this
// module and in its form: the TypeScript sources in the workspace, the bundles once published.
const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
const environment = fileURLToPath(new URL(`./index${extension}`, import.meta.url));
const failureSnapshot = fileURLToPath(new URL(`./failure-snapshot${extension}`, import.meta.url));
const DEBUG_FORMATS = new Set(["aria", "compact", "html"]);
const ENVIRONMENT_NAME = "ctrl-dom";
const ENVIRONMENT_PACKAGE = `vitest-environment-${ENVIRONMENT_NAME}`;

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
 *
 * When Node cannot use its default directory (NODE_COMPILE_CACHE, else
 * `<tmpdir>/node-compile-cache`), a per-user `node-compile-cache-<uid>` beside it. GitHub's Ubuntu
 * 26.04 runner images ship a root-owned /tmp/node-compile-cache, where the runner user cannot
 * create its own directory: the image build's software report runs npm, which turns the cache on
 * for itself, as root after the /tmp cleanup, and /tmp stays on disk since
 * actions/runner-images#14814. The same steps as enableNodeCompileCache in ./index.ts.
 *
 * Node writes the cache at a normal exit or on `module.flushCompileCache()`. Vitest 5 flushes
 * before stopping a fork worker; Vitest 4 SIGTERMs it, so there every worker misses on every
 * module and the cache only costs time (TanStack Query's suite on Vitest 4: 3.54 s with it, 3.17 s
 * without). Not worked around: the peer range is vitest >=5.
 */
const COMPILE_CACHE_IMPORT =
  '--import=data:text/javascript,import{constants,enableCompileCache}from"node:module";import{tmpdir}from"node:os";' +
  "if(enableCompileCache().status===constants.compileCacheStatus.FAILED&&process.getuid)" +
  'enableCompileCache(tmpdir()+"/node-compile-cache-"+process.getuid())';

/**
 * @internal The Node flags the plugin adds to a project's workers: the compile cache from process
 * start (with `compileCache`), in every pool. Exported for comparison/, which mirrors the plugin's
 * setup without loading Vitest's config machinery.
 */
export function workerExecArgv({
  compileCache = false,
}: {
  pool?: unknown;
  execArgv?: readonly string[];
  compileCache?: boolean;
}): string[] {
  const flags: string[] = [];
  // The same override as the environment's own compileCache option.
  const env = process.env.CTRL_DOM_COMPILE_CACHE;
  if (env === "1" || (env !== "0" && compileCache)) flags.push(COMPILE_CACHE_IMPORT);
  // Not added: `--min-semi-space-size=16` (−7% worker CPU, +13 MB RSS per worker, no measurable
  // wall time; bench/README.md "Worker startup").
  return flags;
}

/** @ctrl/dom's Vitest environment plus (by default) the Testing Library aliases. */
export function ctrlDom(options: CtrlDomPluginOptions = {}): Plugin {
  const { testingLibrary = true, debug, ...rest } = options;
  // The compile cache pays off for @ctrl/dom's few large bundles, not for stock Testing Library's
  // many small files (CtrlDomEnvironmentOptions.compileCache).
  const environmentOptions: CtrlDomEnvironmentOptions = { compileCache: testingLibrary, ...rest };
  // Agent debug output (docs/agent-debugging.md); a CTRL_DOM_DEBUG set in the shell wins (it is
  // how `npx ctrl-dom debug` turns it on).
  const shellDebug = process.env.CTRL_DOM_DEBUG;
  const agentMode = DEBUG_FORMATS.has(
    String(shellDebug ?? debug ?? "")
      .trim()
      .toLowerCase(),
  );
  return {
    name: "@ctrl/dom",
    // Before Vite's own resolver, which would look for the package in node_modules.
    enforce: "pre",
    // `// @vitest-environment ctrl-dom`: Vitest looks a custom environment name up as the package
    // `vitest-environment-<name>`, through Vite's resolver.
    resolveId(id) {
      return id === ENVIRONMENT_PACKAGE ? environment : null;
    },
    config(config) {
      // The project's environment unless it names another one (`environment: "node"` with
      // per-file docblocks for ctrl-dom): "ctrl-dom" becomes the path, since Vitest checks a run's
      // environment is an installed package before plugins resolve it.
      const configured = (config as { test?: { environment?: string } }).test?.environment;
      return {
        ...(testingLibrary ? { resolve: { alias: TESTING_LIBRARY } } : {}),
        test: {
          ...(configured === undefined || configured === ENVIRONMENT_NAME ? { environment } : {}),
          environmentOptions: { [ENVIRONMENT_NAME]: environmentOptions },
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
      const flags = workerExecArgv({
        pool: config.pool,
        execArgv: config.execArgv,
        compileCache: environmentOptions.compileCache === true,
      });
      if (flags.length > 0) config.execArgv = [...(config.execArgv ?? []), ...flags];
    },
  };
}

export default ctrlDom;
