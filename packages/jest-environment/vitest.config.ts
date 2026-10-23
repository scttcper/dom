import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "jest-environment-rtd",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
