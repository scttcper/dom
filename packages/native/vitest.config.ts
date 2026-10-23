import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@rtd/native",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
});
