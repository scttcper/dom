import { defineProject } from "vitest/config";

// DOM-level differential suite: every scenario runs on jsdom (oracle) and @ctrl/dom in-process.
export default defineProject({
  test: {
    name: "compat",
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["test/leaks/**"], // vitest.leaks.config.ts (needs --expose-gc)
    environment: "node",
  },
});
