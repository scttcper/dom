// `@rtd/sentry` (published `@ctrl/dom/sentry`): test observability in Sentry. Test files become
// traces (a span per test, per Testing Library query and waitFor, per user-event action and per
// render), failing tests become issues with the page's accessibility snapshot attached, and tests
// that pass only on a retry become flaky-test issues. Sends to a project DSN and/or Spotlight.
//
// Vitest: `plugins: [ctrlDom({ sentry: true })]`. Jest: `reporters: ["default", "@ctrl/dom/sentry/jest"]`.
// See docs/sentry.md.

export { resolveOptions, type CtrlDomSentryOptions, type ResolvedOptions } from "./options.ts";
export { buildReport, type BuiltReport, type ErrorInfo, type TestCaseReport, type TestFileReport } from "./report.ts";
export type { CollectedSpan, CollectedTest, FailureContext } from "./collector.ts";
