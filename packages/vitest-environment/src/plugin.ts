// `plugins: [ctrlDom()]` in vitest.config.ts, published as `@ctrl/dom/vitest`: @ctrl/dom's Vitest
// environment, plus every stock Testing Library import routed to @ctrl/dom's implementation, so
// existing tests run on the whole stack unchanged. Only @ctrl/dom needs to be installed: the
// environment is referenced by path, and the plugin answers for the name "ctrl-dom" too (per-file
// docblocks). Works in every pool: under VM pools, `@ctrl/dom` itself resolves to a bridge
// returning the environment's DOM instance (scripts/release.ts, writeBridges), so nothing here
// needs to be inlined.

import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
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
  /**
   * Resolve `react/jsx-runtime` and `react/jsx-dev-runtime` to ES module copies of them (default
   * true). Vitest hands the code it transforms a Proxy over a CommonJS dependency, so every
   * element a test or component creates otherwise calls `jsx` through the Proxy's `get` trap; a
   * hooks-heavy render is 8% faster without it. Left alone when the project's React is not the
   * one @ctrl/dom resolves (an alias to another JSX runtime, a second copy of React).
   */
  jsxRuntime?: boolean;
  /**
   * Run a worker's test files one after another in the same realm instead of starting a worker
   * per file (default false): Vitest's `isolate: false`, with first-party modules evaluated again
   * and the window reset before each file, and Testing Library's cleanup registered for each
   * (./shared-workers.ts has the details). Much faster for suites of many short files — Base UI's
   * 9,199 tests take 35 s isolated and 7–8 s this way — and less isolated: modules Vitest loads
   * from node_modules stay loaded, so a file can see what an earlier one did to a dependency's
   * module state, to `<head>`, or to a prototype. Needs @ctrl/dom's Testing Library
   * (`testingLibrary`), and does nothing in the VM pools, which reuse workers already.
   */
  sharedWorkers?: boolean;
}

// The environment and agent debug mode's failure snapshots (docs/agent-debugging.md: a setup file
// that appends an aria snapshot of document.body to every failing test's error), next to this
// module and in its form: the TypeScript sources in the workspace, the bundles once published.
const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
const environment = fileURLToPath(new URL(`./index${extension}`, import.meta.url));
const failureSnapshot = fileURLToPath(new URL(`./failure-snapshot${extension}`, import.meta.url));
const sharedWorkersSetup = fileURLToPath(new URL(`./shared-workers${extension}`, import.meta.url));
/** React's JSX runtimes as ES modules without a default export (./jsx-runtime.ts has the reason). */
const JSX_RUNTIMES: Record<string, string> = {
  "react/jsx-runtime": fileURLToPath(new URL(`./jsx-runtime${extension}`, import.meta.url)),
  "react/jsx-dev-runtime": fileURLToPath(new URL(`./jsx-dev-runtime${extension}`, import.meta.url)),
};
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

/**
 * The file Node loads for `specifier` from `from`, symlinks resolved, or null. The JSX runtime
 * copies import React from where they are, so they stand in for the project's only when both
 * resolve to one file.
 */
function resolvedFrom(from: string, specifier: string): string | null {
  try {
    return realpathSync(createRequire(from).resolve(specifier));
  } catch {
    return null;
  }
}

/** @ctrl/dom's Vitest environment plus (by default) the Testing Library aliases. */
export function ctrlDom(options: CtrlDomPluginOptions = {}): Plugin {
  const { testingLibrary = true, debug, jsxRuntime = true, sharedWorkers = false, ...rest } = options;
  if (sharedWorkers && !testingLibrary) {
    throw new Error(
      "@ctrl/dom: `sharedWorkers` needs `testingLibrary` (the default): stock @testing-library/react registers its cleanup for the first test file of a worker only.",
    );
  }
  // Set once Vitest configures a project: the same plugins may serve a Vite build or dev server.
  let underVitest = false;
  /** What React's own runtime resolves to from a JSX runtime copy, per specifier (null: not installed). */
  const reactRuntime = new Map<string, string | null>();
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
    async resolveId(id, importer, resolveOptions) {
      if (id === ENVIRONMENT_PACKAGE) return environment;
      const copy = jsxRuntime && underVitest ? JSX_RUNTIMES[id] : undefined;
      // The copy's own import of the runtime is React's.
      if (copy === undefined || importer === copy) return null;
      let react = reactRuntime.get(id);
      if (react === undefined) reactRuntime.set(id, (react = resolvedFrom(copy, id)));
      if (react === null) return null;
      const resolved = await this.resolve(id, importer, { ...resolveOptions, skipSelf: true });
      if (resolved === null) return null;
      let file: string;
      try {
        file = realpathSync(resolved.id.split("?")[0]);
      } catch {
        return null;
      }
      return file === react ? copy : null;
    },
    config(config) {
      // The project's environment unless it names another one (`environment: "node"` with
      // per-file docblocks for ctrl-dom): "ctrl-dom" becomes the path, since Vitest checks a run's
      // environment is an installed package before plugins resolve it.
      const configured = (config as { test?: { environment?: string } }).test?.environment;
      return {
        ...(testingLibrary ? { resolve: { alias: TESTING_LIBRARY } } : {}),
        test: {
          server: {
            deps: {
              // Loaded by Node, like a dependency, wherever this package is (a workspace's sources
              // too): an ES module without a default export gets no Proxy only when Vitest does
              // not transform it.
              ...(jsxRuntime
                ? { external: Object.values(JSX_RUNTIMES).map((f) => new RegExp(`^${RegExp.escape(f)}$`)) }
                : {}),
              // Transformed by Vitest, unlike the rest of this package in node_modules: Vitest runs
              // a setup file again for each test file only when it evaluates the module itself
              // (Node would cache it after the worker's first file).
              ...(sharedWorkers ? { inline: [new RegExp(`^${RegExp.escape(sharedWorkersSetup)}$`)] } : {}),
            },
          },
          ...(sharedWorkers ? { isolate: false } : {}),
          ...(configured === undefined || configured === ENVIRONMENT_NAME ? { environment } : {}),
          environmentOptions: { [ENVIRONMENT_NAME]: environmentOptions },
          ...(debug && shellDebug === undefined ? { env: { CTRL_DOM_DEBUG: debug } } : {}),
          // Added after the project's own setup files, so the afterEach hooks they register run first.
          ...(agentMode ? { setupFiles: [failureSnapshot] } : {}),
        },
      };
    },
    // Worker flags go on the resolved project config (a CLI `--pool` included), known only here.
    configureVitest({ project, defineCacheKeyGenerator }) {
      const config = project.config;
      if (config.browser?.enabled) return;
      underVitest = true;
      // What these options resolve imports to is in the transforms Vitest keeps on disk: a key
      // per combination, or a file transformed under one would be reused under another.
      defineCacheKeyGenerator(() => `@ctrl/dom testingLibrary=${testingLibrary} jsxRuntime=${jsxRuntime}`);
      // First, so each file starts from the reset: before the project's setup files import anything.
      if (sharedWorkers && config.pool !== "vmThreads" && config.pool !== "vmForks") {
        config.setupFiles = [sharedWorkersSetup, ...config.setupFiles];
        // Its end-of-file reset is an afterAll hook that must run last (./shared-workers.ts).
        if (config.sequence.hooks !== "stack") config.env = { ...config.env, CTRL_DOM_SHARED_WORKERS_END: "0" };
      }
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
