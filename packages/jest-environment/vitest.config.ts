import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@ctrl/dom-jest-environment",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
