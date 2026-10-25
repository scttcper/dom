// One test file's results as Sentry envelopes, independent of the runner (vitest.ts and jest.ts
// adapt their results to TestFileReport):
//
// - a transaction for the file (op "test.file"), a span per test (op "test.case"), and under each
//   test the spans its Testing Library queries, waitFor calls, user-event actions and renders
//   published (collector.ts);
// - an error event per failing test, fingerprinted by file and test name so a test that fails
//   again lands in the same issue, linked to its test span, with the spans as breadcrumbs and the
//   page's accessibility snapshot and HTML attached;
// - a warning event per flaky test (failed, then passed on a retry), grouped the same way;
// - an error event per test file that failed to load (its tests never ran).
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
  /** The test's console output (Vitest reports it per test), shown as breadcrumbs. */
  console?: ConsoleEntry[];
}

export interface ConsoleEntry {
  /** Epoch seconds. */
  timestamp: number;
  stream: "stdout" | "stderr";
  message: string;
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
  /** Why the file failed to load or run, when it did (an import error, a syntax error). */
  fileErrors?: ErrorInfo[];
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
const MAX_CONSOLE_MESSAGE = 1000;
/** The test name a file-level failure is reported under. */
export const FILE_FAILURE = "(file failed to load)";
const MAX_MESSAGE = 8192;
/** Sentry truncates tag values longer than this. */
const MAX_TAG = 200;

export function buildReport(report: TestFileReport, options: ResolvedOptions): BuiltReport {
  const out: BuiltReport = { envelopes: [], traces: 0, failures: 0, flaky: 0 };
  const tests = report.tests.filter((t) => t.state !== "skip");
  const fileErrors = report.fileErrors ?? [];
  if (tests.length === 0 && fileErrors.length === 0) return out;
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

  // One group of spans per test: the test's span, then its collected spans in start order (so a
  // span always follows its parent). A span whose parent is missing (the collector's per-test limit
  // drops by end time) hangs off the test's span: Relay rejects a parent_span_id that is not there.
  const testSpans = new Map<TestCaseReport, string>();
  const groups: Array<{ test: TestCaseReport; spans: Record<string, unknown>[]; start: number; end: number; dropped: number }> = [];
  for (const test of tests) {
    const id = spanId();
    testSpans.set(test, id);
    const testStart = test.collected?.startedAt ?? test.startedAt;
    const testEnd = test.collected?.endedAt ?? test.startedAt + test.duration / 1000;
    const group = {
      test,
      start: testStart,
      end: testEnd,
      dropped: 0,
      spans: [
        {
          trace_id: traceId,
          span_id: id,
          op: "test.case",
          description: test.name,
          start_timestamp: testStart,
          timestamp: testEnd,
          status: test.state === "pass" ? "ok" : "internal_error",
          origin: "auto.test.ctrl_dom",
          data: { "test.retries": test.retries, "test.flaky": test.flaky, ...(test.collected?.droppedSpans ? { "spans.dropped": test.collected.droppedSpans } : {}) },
        } as Record<string, unknown>,
      ],
    };
    const kept = new Set<string>([id]);
    for (const span of [...(test.collected?.spans ?? [])].sort((a, b) => a.start_timestamp - b.start_timestamp)) {
      if (group.spans.length >= MAX_SPANS) {
        group.dropped++;
        continue;
      }
      kept.add(span.span_id);
      group.spans.push({ ...span, trace_id: traceId, parent_span_id: span.parent_span_id !== undefined && kept.has(span.parent_span_id) ? span.parent_span_id : id, origin: "auto.test.ctrl_dom" });
    }
    groups.push(group);
  }
  // A transaction holds at most 1000 spans. A file with more is split by whole tests into further
  // transactions in the same trace, each a child of the file's, so no test loses its spans.
  const chunks: Array<typeof groups> = [[]];
  let size = 0;
  for (const group of groups) {
    if (size + group.spans.length > MAX_SPANS && chunks.at(-1)!.length > 0) {
      chunks.push([]);
      size = 0;
    }
    chunks.at(-1)!.push(group);
    size += group.spans.length;
  }
  const start = Math.min(...groups.map((g) => g.start));
  const end = Math.max(...groups.map((g) => g.end));

  // Sampled per file: a file's trace is whole or absent, and its issues link to it only when sent.
  const traced = options.traces && tests.length > 0 && (options.tracesSampleRate >= 1 || Math.random() < options.tracesSampleRate);
  if (traced) {
    chunks.forEach((chunk, index) => {
      const first = index === 0;
      const chunkSpanId = first ? rootSpanId : spanId();
      const failed = chunk.some((g) => g.test.state === "fail");
      const dropped = chunk.reduce((n, g) => n + g.dropped, 0);
      const eventId = uuid();
      const spans = chunk.flatMap((g) => g.spans.map((span) => (span.op === "test.case" && span.span_id === testSpans.get(g.test) ? { ...span, parent_span_id: chunkSpanId } : span)));
      out.envelopes.push({
        eventId,
        items: [
          {
            type: "transaction",
            payload: {
              ...base,
              type: "transaction",
              event_id: eventId,
              transaction: first ? file : `${file} (part ${index + 1} of ${chunks.length})`,
              transaction_info: { source: "custom" },
              // The file's transaction spans the whole file, so the others nest inside it.
              start_timestamp: first ? start : Math.min(...chunk.map((g) => g.start)),
              timestamp: first ? end : Math.max(...chunk.map((g) => g.end)),
              tags,
              contexts: {
                ...base.contexts,
                trace: {
                  trace_id: traceId,
                  span_id: chunkSpanId,
                  ...(first ? {} : { parent_span_id: rootSpanId }),
                  op: "test.file",
                  status: (first ? groups.some((g) => g.test.state === "fail") : failed) ? "internal_error" : "ok",
                  origin: "auto.test.ctrl_dom",
                  ...(dropped || chunks.length > 1 ? { data: { ...(dropped ? { "spans.dropped": dropped } : {}), ...(chunks.length > 1 ? { "test.part": index + 1, "test.parts": chunks.length } : {}) } } : {}),
                },
              },
              spans,
              ...(first && report.environmentSetupMs !== undefined ? { measurements: { environment_setup: { value: report.environmentSetupMs, unit: "millisecond" } } } : {}),
            },
          },
        ],
      });
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
            ...(traced ? { trace: { trace_id: traceId, span_id: testSpans.get(test), parent_span_id: rootSpanId, op: "test.case" } } : {}),
            test: { name: test.name, file, duration_ms: test.duration, retries: test.retries, flaky: test.flaky },
            ...(context?.clock ? { clock: { skipped_ms: context.clock.skippedMs, pending_timers: context.clock.pendingTimers } } : {}),
          },
          breadcrumbs: { values: breadcrumbs(test.collected?.spans ?? [], test.console ?? []) },
        },
      },
    ];
    if (options.snapshots && context !== undefined) items.push(...attachments(context));
    out.envelopes.push({ eventId, items });
    if (failed) out.failures++;
    else out.flaky++;
  }

  if (options.failures) {
    for (const error of fileErrors.slice(0, 1)) {
      const eventId = uuid();
      out.envelopes.push({
        eventId,
        items: [
          {
            type: "event",
            payload: {
              ...base,
              event_id: eventId,
              timestamp: Date.now() / 1000,
              level: "error",
              logger: `${report.runner}.test`,
              transaction: `${file} > ${FILE_FAILURE}`,
              fingerprint: ["ctrl-dom.test-failure", file, FILE_FAILURE],
              exception: { values: [toException(error, report.root)] },
              tags: { ...tags, "test.name": FILE_FAILURE, flaky: "false", retries: "0" },
              contexts: { ...base.contexts, test: { name: FILE_FAILURE, file } },
            },
          },
        ],
      });
      out.failures++;
    }
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

/** What the test did and printed before it failed, oldest first: the issue page's breadcrumb timeline. */
function breadcrumbs(spans: readonly CollectedSpan[], output: readonly ConsoleEntry[]): Record<string, unknown>[] {
  const crumbs = [
    ...spans.map((s) => ({
      type: "default",
      category: s.op,
      message: s.description,
      timestamp: s.start_timestamp,
      level: s.status === "ok" ? "info" : "error",
      data: { duration_ms: Math.round((s.timestamp - s.start_timestamp) * 1e6) / 1e3, ...s.data },
    })),
    ...output.map((c) => ({
      type: "default",
      category: "console",
      message: c.message.length > MAX_CONSOLE_MESSAGE ? `${c.message.slice(0, MAX_CONSOLE_MESSAGE - 1)}…` : c.message,
      timestamp: c.timestamp,
      level: c.stream === "stderr" ? "error" : "info",
    })),
  ];
  return crumbs.sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_BREADCRUMBS);
}

function attachments(context: FailureContext): EnvelopeItem[] {
  const items: EnvelopeItem[] = [];
  if (context.aria) items.push({ type: "attachment", filename: "accessibility-snapshot.txt", contentType: "text/plain", payload: context.aria });
  if (context.html) items.push({ type: "attachment", filename: "page.html", contentType: "text/html", payload: context.html });
  return items;
}
