import { defineProject } from "vitest/config";

// The ported suites run on @rtd/dom (vitest-environment-rtd) with @rtd/jest-dom matchers.
// test/differential/stock.test.tsx opts into jsdom per file (the stock oracle).
export default defineProject({
  test: {
    name: "@rtd/react",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    globals: true,
    // Share ONE @rtd/dom instance between vitest-environment-rtd and the tests: load @rtd/dom and
    // the environment natively instead of letting Vite inline a second copy. Other workspace
    // sources stay inlined so vi.mock still reaches their imports.
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    environment: "rtd",
    setupFiles: ["./test/setup.ts"],
    env: { RTD_STACK: "rtd" },
  },
});
