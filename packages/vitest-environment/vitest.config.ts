import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "vitest-environment-rtd",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    // Load the environment and @rtd/dom natively (Node strips the TypeScript), as a published
    // package in node_modules would be. Inlined through Vite instead, every worker re-evaluates
    // ~100 modules through the module runner and the environment and test files each get their
    // own @rtd/dom instance.
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
  },
});
