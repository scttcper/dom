import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@rtd/dom",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
});
