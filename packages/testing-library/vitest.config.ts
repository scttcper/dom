import { defineProject } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";

export default defineProject({
  plugins: [ctrlDom({ testingLibrary: false })],
  test: {
    name: "@ctrl/dom/testing-library",
    // Ported upstream tests stay JavaScript (test/upstream/*.test.js) to keep them diffable
    // against https://github.com/testing-library/dom-testing-library/tree/main/src/__tests__.
    include: ["test/**/*.test.{ts,tsx,js}", "src/**/*.test.{ts,tsx}"],
    globals: true,
    // Share ONE @ctrl/dom instance between @ctrl/dom/vitest-environment and the tests: load @ctrl/dom and
    // the environment natively instead of letting Vite inline a second copy. Other workspace
    // sources stay inlined so vi.mock still reaches their imports.
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    // Upstream runs __tests__ on jsdom and __node_tests__ on node; the ported node tests opt
    // out with `// @vitest-environment node`.
    environment: "ctrl-dom",
    setupFiles: ["./test/setup.ts"],
  },
});
