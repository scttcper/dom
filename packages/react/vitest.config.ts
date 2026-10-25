import { defineProject } from "vitest/config";
import { ctrlDomEnvironment } from "../../vitest.environment.ts";

// The ported suites run on @ctrl/dom (@ctrl/dom/vitest-environment) with @ctrl/dom/jest-dom matchers.
// test/differential/stock.test.tsx opts into jsdom per file (the stock oracle).
export default defineProject({
  plugins: [ctrlDomEnvironment()],
  test: {
    name: "@ctrl/dom/react",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    globals: true,
    // Share ONE @ctrl/dom instance between @ctrl/dom/vitest-environment and the tests: load @ctrl/dom and
    // the environment natively instead of letting Vite inline a second copy. Other workspace
    // sources stay inlined so vi.mock still reaches their imports.
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    environment: "ctrl-dom",
    setupFiles: ["./test/setup.ts"],
    env: { CTRL_DOM_STACK: "ctrl-dom" },
  },
});
