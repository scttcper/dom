import { defineProject } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";

// Leak suite: proves windows, documents, nodes, React roots and testing-library state are
// collectable after the user-facing cleanup (window.close(), cleanup(), environment teardown),
// and that heap-after-GC stays flat over thousands of cycles. Needs --expose-gc.
export default defineProject({
  plugins: [ctrlDom({ testingLibrary: false })],
  test: {
    name: "compat:leaks",
    include: ["test/leaks/**/*.test.{ts,tsx}"],
    environment: "node",
    execArgv: ["--expose-gc"],
    // One @ctrl/dom instance shared by @ctrl/dom/vitest-environment and the tests (loaded natively).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    // Each file measures its own heap; keep them out of each other's way.
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
