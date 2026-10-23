import { defineProject } from "vitest/config";

// Leak suite: proves windows, documents, nodes, React roots and testing-library state are
// collectable after the user-facing cleanup (window.close(), cleanup(), environment teardown),
// and that heap-after-GC stays flat over thousands of cycles. Needs --expose-gc.
export default defineProject({
  test: {
    name: "@rtd/leaks",
    include: ["test/leaks/**/*.test.{ts,tsx}"],
    environment: "node",
    execArgv: ["--expose-gc"],
    // One @rtd/dom instance shared by vitest-environment-rtd and the tests (loaded natively).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    // Each file measures its own heap; keep them out of each other's way.
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
