// runners.test.ts runs Vitest on this directory, on stock jsdom: README's Vitest setup.
import { defineConfig } from "vitest/config";
import { sentryTests } from "@ctrl/sentry-tests/vitest";

export default defineConfig({
  plugins: [sentryTests()],
  test: { root: import.meta.dirname, include: ["cart.vitest.ts"], environment: "jsdom" },
});
