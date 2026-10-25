import { defineProject } from "vitest/config";
import { ctrlDomEnvironment } from "../../vitest.environment.ts";

export default defineProject({
  plugins: [ctrlDomEnvironment()],
  test: {
    name: "@ctrl/dom/vitest-environment",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    // Load the environment and @ctrl/dom natively (Node strips the TypeScript), as a published
    // package in node_modules would be. Inlined through Vite instead, every worker re-evaluates
    // ~100 modules through the module runner and the environment and test files each get their
    // own @ctrl/dom instance.
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
  },
});
