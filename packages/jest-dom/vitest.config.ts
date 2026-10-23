import { defineProject } from "vitest/config";

// Two independent switches:
//   JEST_DOM_IMPL=rtd   -> matchers from @rtd/jest-dom (default)
//   JEST_DOM_IMPL=stock -> matchers from @testing-library/jest-dom@7.0.1 (used to (re)generate
//                          the inline snapshots: the oracle for failure messages)
//   RTD_STACK=rtd       -> DOM from vitest-environment-rtd (@rtd/dom)  (the target)
//   RTD_STACK=jsdom     -> DOM from jsdom
const impl = process.env.JEST_DOM_IMPL ?? "rtd";
const stack = process.env.RTD_STACK ?? "rtd";

export default defineProject({
  test: {
    name: "@rtd/jest-dom",
    include: ["test/**/*.test.{js,ts,tsx}", "src/**/*.test.{ts,tsx}"],
    // The query matchers run @rtd/testing-library, which only works on @rtd/dom nodes.
    exclude: impl === "rtd" && stack === "jsdom" ? ["test/upstream/to-contain-query-matchers.test.js"] : [],
    globals: true,
    // Share ONE @rtd/dom instance between vitest-environment-rtd and the tests: load @rtd/dom and
    // the environment natively instead of letting Vite inline a second copy. Other workspace
    // sources stay inlined so vi.mock still reaches their imports.
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    environment: stack === "rtd" ? "rtd" : "jsdom",
    setupFiles: [impl === "stock" ? "./test/setup-stock.ts" : "./test/setup-rtd.ts"],
    env: { RTD_STACK: stack, JEST_DOM_IMPL: impl },
  },
});
