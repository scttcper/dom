// happy-dom through Vitest's built-in `happy-dom` environment, stock Testing Library.
import { createRequire } from "node:module";
import type { Contender } from "./types.ts";

const require = createRequire(import.meta.url);

export const happyDom: Contender = {
  id: "happy-dom",
  label: "happy-dom",
  version: () => require("happy-dom/package.json").version,
  environment: "happy-dom",
  loadEnvironment: async () => (await import("vitest/runtime")).builtinEnvironments["happy-dom"],
  imports: { react: "@testing-library/react", userEvent: "@testing-library/user-event" },
  jest: {
    testEnvironment: require.resolve("@happy-dom/jest-environment"),
    label: () => `@happy-dom/jest-environment ${require("@happy-dom/jest-environment/package.json").version}`,
  },
};
