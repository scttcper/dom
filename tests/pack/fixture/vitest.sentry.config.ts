// (s1) docs/sentry.md's Vitest setup: `ctrlDom({ sentry: true })`, SENTRY_DSN set by sentry.check.mjs.
// `globals: true` gives Testing Library its automatic cleanup, as in most Vitest setups; the
// failure snapshot is taken before it runs.
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";

export default defineConfig({
  plugins: [ctrlDom({ sentry: true })],
  test: { include: ["sentry.test.tsx"], globals: true },
});
