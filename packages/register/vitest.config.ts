import { defineProject } from "vitest/config";

// register() installs on the worker's real global, so these tests run in Vitest's node
// environment; the node:test and bun test runs are spawned as child processes.
export default defineProject({
  test: {
    name: "@ctrl/dom/register",
    include: ["test/**/*.test.ts"],
    environment: "node",
    server: { deps: { external: [/\/packages\/(dom|register)\/src\//] } },
  },
});
