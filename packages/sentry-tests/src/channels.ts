// The ways other code feeds the reporter, as `node:diagnostics_channel` channels: a library or a
// test setup file publishes or subscribes by name, without importing @ctrl/sentry-tests (or caring
// which copy of it a worker loaded).
//
// - "sentry-tests:span" (tracing channel): a span to record under whatever the test is running.
//   @ctrl/dom publishes its Testing Library, user-event and React spans the same way on its own
//   "ctrl-dom:span".
// - "sentry-tests:failure" (channel): published when a test fails, before its afterEach hooks (and
//   Testing Library's cleanup) run, so subscribers can attach what they know. @ctrl/dom's
//   environments add the page's accessibility snapshot and the virtual clock.
//
// https://nodejs.org/api/diagnostics_channel.html

/** What a span's tracing channel events carry (the shape @ctrl/dom's trace.ts publishes). */
export interface SpanContext {
  /** Sentry-style operation: "db.query", "testing-library.query", ... */
  op: string;
  /** What ran, as the test wrote it. */
  description: string;
  /** Filled in before the span ends; becomes the span's data. */
  data: Record<string, string | number | boolean>;
  /** True for promise-returning work: the span ends at asyncEnd rather than end. */
  async: boolean;
  /** Set by the tracing channel when the traced function throws or rejects. */
  error?: unknown;
}

export interface Attachment {
  filename: string;
  contentType: string;
  data: string;
}

/** Published on "sentry-tests:failure" when a test fails. */
export interface FailureMessage {
  /** The test's full name: describe blocks and the test, joined with " > ". */
  test: string;
  /** What the test threw. */
  error: unknown;
  /** The environment's document, when there is one (jsdom, happy-dom, @ctrl/dom). */
  document: unknown;
  /** Files for the failure's event. The first one with a given filename wins. */
  attachments: Attachment[];
  /** Contexts for the failure's event: each shows as a section on the issue. */
  contexts: Record<string, Record<string, unknown>>;
  /** Hold the test (before its afterEach hooks) until `promise` settles, for at most 5 s in all. */
  waitUntil(promise: Promise<unknown>): void;
}

/** Tracing channels whose spans are recorded. */
export const SPAN_CHANNELS = ["sentry-tests:span", "ctrl-dom:span"] as const;
export const FAILURE_CHANNEL = "sentry-tests:failure";
