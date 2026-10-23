import { defineProject } from "vitest/config";
import { include } from "./vitest.react.shared.ts";

export default defineProject({
  test: {
    name: "compat:react-jsdom",
    include,
    environment: "jsdom",
    setupFiles: ["./react/setup.ts"],
    env: { COMPAT_ENGINE: "jsdom" },
  },
});
