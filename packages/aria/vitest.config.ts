import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@rtd/aria",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
});
