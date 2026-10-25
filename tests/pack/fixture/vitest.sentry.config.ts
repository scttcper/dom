// (s1) @ctrl/sentry-tests' Vitest setup (its README) next to ctrlDom(), SENTRY_DSN set by
// sentry.check.mjs. `globals: true` gives Testing Library its automatic cleanup, as in most Vitest
// setups; the failure capture runs before it.
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";
import { sentryTests } from "@ctrl/sentry-tests/vitest";

export default defineConfig({
  plugins: [ctrlDom(), sentryTests()],
  test: { include: ["sentry.test.tsx", "sentry-broken.test.tsx"], globals: true },
});
