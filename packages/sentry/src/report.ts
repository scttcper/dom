// One test file's results as Sentry envelopes, independent of the runner (vitest.ts and jest.ts
// adapt their results to TestFileReport):
//
// - a transaction for the file (op "test.file"), a span per test (op "test.case"), and under each
//   test the spans its Testing Library queries, waitFor calls, user-event actions and renders
//   published (collector.ts);
// - an error event per failing test, fingerprinted by file and test name so a test that fails
//   again lands in the same issue, linked to its test span, with the spans as breadcrumbs and the
//   page's accessibility snapshot and HTML attached;
// - a warning event per flaky test (failed, then passed on a retry), grouped the same way.
//
// https://develop.sentry.dev/sdk/data-model/event-payloads/transaction/

import { relative } from "node:path";
import type { CollectedSpan, CollectedTest, FailureContext } from "./collector.ts";
import { parseStack, SDK, spanId, toSentryFrames, uuid, type Envelope, type EnvelopeItem, type ParsedFrame } from "./envelope.ts";
import type { ResolvedOptions } from "./options.ts";

export interface ErrorInfo {
  name?: string;
  message: string;
  stack?: string;
  /** Frames the runner already parsed and source-mapped (Vitest), oldest last as V8 prints them. */
  frames?: ParsedFrame[];
}

export interface TestCaseReport {
  /** Full name: describe blocks and the test, joined with " > ". */
  name: string;
  state: "pass" | "fail" | "skip";
  /** Epoch seconds. */
  startedAt: number;
  /** Milliseconds. */
  duration: number;
  retries: number;
  /** Failed, then passed on a retry. */
  flaky: boolean;
  errors: ErrorInfo[];
  /** What the worker collected for the test (null when it collected nothing). */
  collected: CollectedTest | null;
}

export interface TestFileReport {
  runner: "vitest" | "jest";
  /** Paths in events are relative to this. */
  root: string;
  /** Absolute path of the test file. */
  file: string;
  project?: string;
  tests: TestCaseReport[];
  environmentSetupMs?: number;
}

export interface BuiltReport {
  envelopes: Envelope[];
  traces: number;
  failures: number;
  flaky: number;
}

/** Sentry keeps at most 1000 spans per transaction. */
const MAX_SPANS = 1000;
const MAX_BREADCRUMBS = 100;
const MAX_MESSAGE = 8192;
/** Sentry truncates tag values longer than this. */
const MAX_TAG = 200;

export function buildReport(report: TestFileReport, options: ResolvedOptions): BuiltReport {
  const out: BuiltReport = { envelopes: [], traces: 0, failures: 0, flaky: 0 };
  const tests = report.tests.filter((t) => t.state !== "skip");
  if (tests.length === 0) return out;
  const file = relative(report.root, report.file) || report.file;
  const traceId = uuid();
  const rootSpanId = spanId();
  const tags: Record<string, string> = {
    runner: report.runner,
    "test.file": tag(file),
    ...(report.project ? { "test.project": tag(report.project) } : {}),
    ...options.tags,
  };
  const base = {
    platform: "node",
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    sdk: SDK,
    contexts: { runtime: { name: "node", version: process.version } },
  };

  const spans: Record<string, unknown>[] = [];
  let dropped = 0;
  const testSpans = new Map<TestCaseReport, string>();
  let start = Infinity;
  let end = -Infinity;
  for (const test of tests) {
    const id = spanId();
    testSpans.set(test, id);
    const testStart = test.collected?.startedAt ?? test.startedAt;
    const testEnd = test.collected?.endedAt ?? test.startedAt + test.duration / 1000;
    start = Math.min(start, testStart);
    end = Math.max(end, testEnd);
    spans.push({
      trace_id: traceId,
      span_id: id,
      parent_span_id: rootSpanId,
      op: "test.case",
      description: test.name,
      start_timestamp: testStart,
      timestamp: testEnd,
      status: test.state === "pass" ? "ok" : "internal_error",
      origin: "auto.test.ctrl-dom",
      data: { "test.retries": test.retries, "test.flaky": test.flaky, ...(test.collected?.droppedSpans ? { "spans.dropped": test.collected.droppedSpans } : {}) },
    });
    for (const span of test.collected?.spans ?? []) {
      if (spans.length >= MAX_SPANS) {
        dropped++;
        continue;
      }
      spans.push({ ...span, trace_id: traceId, parent_span_id: span.parent_span_id ?? id, origin: "auto.test.ctrl-dom" });
    }
  }

  if (options.traces) {
    const failed = tests.some((t) => t.state === "fail");
    const eventId = uuid();
    out.envelopes.push({
      eventId,
      items: [
        {
          type: "transaction",
          payload: {
            ...base,
            type: "transaction",
            event_id: eventId,
            transaction: file,
            transaction_info: { source: "custom" },
            start_timestamp: start,
            timestamp: end,
            tags,
            contexts: {
              ...base.contexts,
              trace: { trace_id: traceId, span_id: rootSpanId, op: "test.file", status: failed ? "internal_error" : "ok", origin: "auto.test.ctrl-dom", ...(dropped ? { data: { "spans.dropped": dropped } } : {}) },
            },
            spans,
            ...(report.environmentSetupMs !== undefined ? { measurements: { environment_setup: { value: report.environmentSetupMs, unit: "millisecond" } } } : {}),
          },
        },
      ],
    });
    out.traces++;
  }

  for (const test of tests) {
    const failed = test.state === "fail";
    if (!(failed ? options.failures : test.flaky && options.flaky)) continue;
    const failures = test.collected?.failures ?? [];
    const context = failures.at(-1);
    const error = failed ? (test.errors[0] ?? failures.at(-1)?.error) : (failures[0]?.error ?? test.errors[0]);
    const exception = [toException(error ?? { message: "Test failed" }, report.root)];
    if (!failed) {
      exception.push({
        type: "FlakyTest",
        value: `${test.name} (passed on retry ${test.retries})`,
        mechanism: { type: "chained", handled: true, source: "cause" },
      } as never);
    }
    const eventId = uuid();
    const items: EnvelopeItem[] = [
      {
        type: "event",
        payload: {
          ...base,
          event_id: eventId,
          timestamp: (test.collected?.endedAt ?? test.startedAt + test.duration / 1000),
          level: failed ? "error" : "warning",
          logger: `${report.runner}.test`,
          transaction: `${file} > ${test.name}`,
          fingerprint: [failed ? "ctrl-dom.test-failure" : "ctrl-dom.flaky-test", file, test.name],
          exception: { values: exception },
          tags: { ...tags, "test.name": tag(test.name), flaky: String(test.flaky), retries: String(test.retries) },
          contexts: {
            ...base.contexts,
            trace: { trace_id: traceId, span_id: testSpans.get(test), parent_span_id: rootSpanId, op: "test.case" },
            test: { name: test.name, file, duration_ms: test.duration, retries: test.retries, flaky: test.flaky },
            ...(context?.clock ? { clock: { skipped_ms: context.clock.skippedMs, pending_timers: context.clock.pendingTimers } } : {}),
          },
          breadcrumbs: { values: breadcrumbs(test.collected?.spans ?? []) },
        },
      },
    ];
    if (options.snapshots && context !== undefined) items.push(...attachments(context));
    out.envelopes.push({ eventId, items });
    if (failed) out.failures++;
    else out.flaky++;
  }
  return out;
}

function tag(value: string): string {
  return value.length > MAX_TAG ? `${value.slice(0, MAX_TAG - 1)}…` : value;
}

function toException(error: ErrorInfo, root: string): Record<string, unknown> {
  const message = error.message.length > MAX_MESSAGE ? `${error.message.slice(0, MAX_MESSAGE - 1)}…` : error.message;
  // Vitest's parsed frames come newest first, like V8 prints them; Sentry wants oldest first.
  const frames = error.frames !== undefined ? [...error.frames].reverse() : parseStack(error.stack);
  return {
    type: error.name || "Error",
    value: message,
    mechanism: { type: "ctrl-dom.test", handled: true },
    ...(frames.length > 0 ? { stacktrace: { frames: toSentryFrames(frames, root) } } : {}),
  };
}

/** What the test did before it failed, oldest first: the issue page's breadcrumb timeline. */
function breadcrumbs(spans: readonly CollectedSpan[]): Record<string, unknown>[] {
  return [...spans]
    .sort((a, b) => a.start_timestamp - b.start_timestamp)
    .slice(-MAX_BREADCRUMBS)
    .map((s) => ({
      type: "default",
      category: s.op,
      message: s.description,
      timestamp: s.start_timestamp,
      level: s.status === "ok" ? "info" : "error",
      data: { duration_ms: Math.round((s.timestamp - s.start_timestamp) * 1e6) / 1e3, ...s.data },
    }));
}

function attachments(context: FailureContext): EnvelopeItem[] {
  const items: EnvelopeItem[] = [];
  if (context.aria) items.push({ type: "attachment", filename: "accessibility-snapshot.txt", contentType: "text/plain", payload: context.aria });
  if (context.html) items.push({ type: "attachment", filename: "page.html", contentType: "text/html", payload: context.html });
  return items;
}
