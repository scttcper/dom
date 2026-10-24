// `plugins: [ctrlDom()]` in vitest.config.ts: @ctrl/dom's Vitest environment, plus every stock
// Testing Library import routed to @ctrl/dom's implementation, so existing tests run on the
// whole stack unchanged. Only @ctrl/dom needs to be installed: the environment is referenced by
// path (vitest-environment-ctrl-dom exists for `environment: "ctrl-dom"` and docblocks). Works in
// every pool: under VM pools, `@ctrl/dom` itself resolves to a bridge returning the environment's
// DOM instance (scripts/release.ts, writeBridges), so nothing here needs to be inlined.
import { fileURLToPath } from "node:url";

const environment = fileURLToPath(new URL("./dist/vitest-environment/index.js", import.meta.url));
// Agent debug mode's failure snapshots (docs/agent-debugging.md): a setup file that appends an aria
// snapshot of document.body to every failing test's error.
const failureSnapshot = fileURLToPath(new URL("./dist/vitest-environment/failure-snapshot.js", import.meta.url));
const DEBUG_FORMATS = new Set(["aria", "compact", "html"]);

const TESTING_LIBRARY = [
  { find: /^@testing-library\/react(\/.*)?$/, replacement: "@ctrl/dom/react$1" },
  { find: /^@testing-library\/dom$/, replacement: "@ctrl/dom/testing-library" },
  { find: /^@testing-library\/user-event$/, replacement: "@ctrl/dom/user-event" },
  { find: /^@testing-library\/jest-dom(\/.*)?$/, replacement: "@ctrl/dom/jest-dom$1" },
];

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
    config() {
      return {
        ...(testingLibrary ? { resolve: { alias: TESTING_LIBRARY } } : {}),
        test: {
          environment,
          environmentOptions: { "ctrl-dom": environmentOptions },
          ...(debug && shellDebug === undefined ? { env: { CTRL_DOM_DEBUG: debug } } : {}),
          // Added after the project's own setup files, so its afterEach runs before theirs.
          ...(agentMode ? { setupFiles: [failureSnapshot] } : {}),
        },
      };
    },
  };
}

export default ctrlDom;
