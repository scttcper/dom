import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@rtd/testing-library",
    // Ported upstream tests stay JavaScript (test/upstream/*.test.js) to keep them diffable
    // against https://github.com/testing-library/dom-testing-library/tree/main/src/__tests__.
    include: ["test/**/*.test.{ts,tsx,js}", "src/**/*.test.{ts,tsx}"],
    globals: true,
    // Share ONE @rtd/dom instance between vitest-environment-rtd and the tests: load @rtd/dom and
    // the environment natively instead of letting Vite inline a second copy. Other workspace
    // sources stay inlined so vi.mock still reaches their imports.
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    // Upstream runs __tests__ on jsdom and __node_tests__ on node; the ported node tests opt
    // out with `// @vitest-environment node`.
    environment: "rtd",
    setupFiles: ["./test/setup.ts"],
  },
});
