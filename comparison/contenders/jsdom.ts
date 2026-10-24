// jsdom through Vitest's built-in `jsdom` environment, stock Testing Library.
import { createRequire } from "node:module";
import type { Contender } from "./types.ts";

const require = createRequire(import.meta.url);

export const jsdom: Contender = {
  id: "jsdom",
  label: "jsdom",
  version: () => require("jsdom/package.json").version,
  environment: "jsdom",
  loadEnvironment: async () => (await import("vitest/runtime")).builtinEnvironments.jsdom,
  imports: { react: "@testing-library/react", userEvent: "@testing-library/user-event" },
  // jest-environment-jsdom, which ships its own jsdom (26.x): what a Jest suite runs on.
  jest: {
    testEnvironment: require.resolve("jest-environment-jsdom"),
    label: () => {
      const env = require("jest-environment-jsdom/package.json").version;
      const jsdomVersion = createRequire(require.resolve("jest-environment-jsdom")).resolve("jsdom/package.json");
      return `jest-environment-jsdom ${env} (jsdom ${require(jsdomVersion).version})`;
    },
  },
};
