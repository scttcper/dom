import { defineProject } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";

// Two independent switches:
//   JEST_DOM_IMPL=ctrl-dom   -> matchers from @ctrl/dom/jest-dom (default)
//   JEST_DOM_IMPL=stock -> matchers from @testing-library/jest-dom@7.0.1 (used to (re)generate
//                          the inline snapshots: the oracle for failure messages)
//   CTRL_DOM_STACK=ctrl-dom       -> DOM from @ctrl/dom/vitest-environment (@ctrl/dom)  (the target)
//   CTRL_DOM_STACK=jsdom     -> DOM from jsdom
const impl = process.env.JEST_DOM_IMPL ?? "ctrl-dom";
const stack = process.env.CTRL_DOM_STACK ?? "ctrl-dom";

export default defineProject({
  plugins: [ctrlDom({ testingLibrary: false })],
  test: {
    name: "@ctrl/dom/jest-dom",
    include: ["test/**/*.test.{js,ts,tsx}", "src/**/*.test.{ts,tsx}"],
    // The query matchers run @ctrl/dom/testing-library, which only works on @ctrl/dom nodes.
    exclude: impl === "ctrl-dom" && stack === "jsdom" ? ["test/upstream/to-contain-query-matchers.test.js"] : [],
    globals: true,
    // Share ONE @ctrl/dom instance between @ctrl/dom/vitest-environment and the tests: load @ctrl/dom and
    // the environment natively instead of letting Vite inline a second copy. Other workspace
    // sources stay inlined so vi.mock still reaches their imports.
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    environment: stack,
    setupFiles: [impl === "stock" ? "./test/setup-stock.ts" : "./test/setup-ctrl-dom.ts"],
    // Failure messages are compared as text (inline snapshots, oracle files): no colors, though
    // CI's environment turns them on in Vitest's workers (an agent's turns them off).
    env: { CTRL_DOM_STACK: stack, JEST_DOM_IMPL: impl, NO_COLOR: "1" },
  },
});
