import { defineProject } from "vitest/config";

// DOM-level differential suite: every scenario runs on jsdom (oracle) and @rtd/dom in-process.
export default defineProject({
  test: {
    name: "@rtd/compat",
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
