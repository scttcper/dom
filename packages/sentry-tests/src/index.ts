// @ctrl/sentry-tests: test runs in Sentry, for Vitest and Jest. Each test file becomes a trace with a
// span per describe block, test, hook and test function (and whatever libraries publish under
// them), each failing test an issue with the page attached, and each test that passed only on a
// retry a flaky-test issue. Sends to a project DSN and/or Spotlight. No Sentry SDK.
//
// Vitest: `plugins: [sentryTests()]` from "@ctrl/sentry-tests/vitest".
// Jest: `reporters: ["default", "@ctrl/sentry-tests/jest"], testRunner: "@ctrl/sentry-tests/jest-runner"`.
// See README.md.

export { resolveOptions, type SentryTestsOptions, type ResolvedOptions } from "./options.ts";
export { buildReport, type BuiltReport, type ErrorInfo, type TestCaseReport, type TestFileReport } from "./report.ts";
export type { CollectedFile, CollectedSpan, CollectedTest, FailureContext } from "./collector.ts";
export { FAILURE_CHANNEL, SPAN_CHANNELS, type Attachment, type FailureMessage, type SpanContext } from "./channels.ts";
