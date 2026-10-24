// `plugins: [ctrlDom()]` in vitest.config.ts: @ctrl/dom's Vitest environment, plus every stock
// Testing Library import routed to @ctrl/dom's implementation, so existing tests run on the
// whole stack unchanged. Only @ctrl/dom needs to be installed: the environment is referenced by
// path (vitest-environment-ctrl-dom exists for `environment: "ctrl-dom"` and docblocks). Works in
// every pool: under VM pools, `@ctrl/dom` itself resolves to a bridge returning the environment's
// DOM instance (scripts/release.ts, writeBridges), so nothing here needs to be inlined.
import { fileURLToPath } from "node:url";

const environment = fileURLToPath(new URL("./dist/vitest-environment/index.js", import.meta.url));

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
  const { testingLibrary = true, ...environmentOptions } = options;
  return {
    name: "@ctrl/dom",
    config() {
      return {
        ...(testingLibrary ? { resolve: { alias: TESTING_LIBRARY } } : {}),
        test: { environment, environmentOptions: { "ctrl-dom": environmentOptions } },
      };
    },
  };
}

export default ctrlDom;
