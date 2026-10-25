// One test file's results as Sentry envelopes, independent of the runner (vitest.ts and jest.ts
// adapt their results to TestFileReport):
//
// - a transaction for the file (op "test.file") holding the spans the worker collected: describe
//   blocks ("test.suite"), tests ("test.case"), hooks ("test.hook"), test functions ("test.fn")
//   and under them the spans libraries published (collector.ts);
// - an error event per failing test, fingerprinted by file and test name so a test that fails
//   again lands in the same issue, linked to its test span, with what it did as breadcrumbs and
//   the page attached;
// - a warning event per flaky test (failed, then passed on a retry), grouped the same way;
// - an error event per test file that failed to load (its tests never ran).
//
// https://develop.sentry.dev/sdk/data-model/event-payloads/transaction/

import { relative } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { CollectedFile, CollectedSpan, FailureContext } from "./collector.ts";
import { parseStack, SDK, spanId, toSentryFrames, uuid, type Envelope, type EnvelopeItem, type ParsedFrame } from "./envelope.ts";
import type { ResolvedOptions } from "./options.ts";

export interface ErrorInfo {
  name?: string;
  message: string;
  stack?: string;
  /** Frames the runner already parsed and source-mapped (Vitest), newest first as V8 prints them. */
  frames?: ParsedFrame[];
}

export interface TestCaseReport {
  /** The test's key in CollectedFile.tests: Vitest's test id, Jest's full name. */
  key: string;
  /** Full name: describe blocks and the test, joined with " > ". */
  name: string;
  state: "pass" | "fail" | "skip";
  /** Milliseconds. */
  duration: number;
  retries: number;
  /** Failed, then passed on a retry. */
  flaky: boolean;
  errors: ErrorInfo[];
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
  /** What the worker's runner collected; without it there is no trace, only the issues. */
  collected: CollectedFile | null;
  environmentSetupMs?: number;
  /**
   * Failures outside any test, each an issue under its name: the file failing to load (an import
   * or syntax error, named FILE_FAILURE), a describe block's beforeAll or afterAll throwing.
   */
  outsideTests?: Array<{ name: string; error: ErrorInfo }>;
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
const ORIGIN = "auto.test.sentry_tests";
/** Structure spans that say nothing a breadcrumb list needs. */
const NOT_BREADCRUMBS = new Set(["test.case", "test.fn", "test.suite", "test.collect"]);

export function buildReport(report: TestFileReport, options: ResolvedOptions): BuiltReport {
  const out: BuiltReport = { envelopes: [], traces: 0, failures: 0, flaky: 0 };
  const tests = report.tests.filter((t) => t.state !== "skip");
  const outsideTests = report.outsideTests ?? [];
  if (tests.length === 0 && outsideTests.length === 0) return out;
  // A file outside the root (a monorepo package's tests run from elsewhere) keeps its full path.
  const relativePath = relative(report.root, report.file);
  const file = relativePath === "" || relativePath.startsWith("..") ? report.file : relativePath;
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

  // The file's spans in start order, so a span always follows its parent. The result of a test
  // belongs on its last attempt's span (Jest has one per attempt).
  const collected = report.collected;
  const spans = [...(collected?.spans ?? [])].sort((a, b) => a.start_timestamp - b.start_timestamp);
  const byId = new Map(spans.map((s) => [s.span_id, s]));
  for (const test of tests) {
    const record = collected?.tests[test.key];
    const last = record?.spanIds.at(-1);
    if (record === undefined || last === undefined) continue;
    const span = byId.get(last)!;
    span.status = test.state === "pass" ? "ok" : "internal_error";
    span.data = { ...span.data, "test.retries": test.retries, "test.flaky": test.flaky, ...(record.droppedSpans ? { "spans.dropped": record.droppedSpans } : {}) };
  }

  // Each span belongs to the test whose "test.case" span it is under, if any.
  const owners = new Map<string, string | null>();
  const ownerOf = (span: CollectedSpan): string | null => {
    let owner = owners.get(span.span_id);
    if (owner !== undefined) return owner;
    const parent = span.parent_span_id === undefined ? undefined : byId.get(span.parent_span_id);
    owner = span.op === "test.case" ? span.span_id : parent === undefined ? null : ownerOf(parent);
    owners.set(span.span_id, owner);
    return owner;
  };
  const fileLevel: CollectedSpan[] = [];
  const groups = new Map<string, CollectedSpan[]>();
  for (const span of spans) {
    const owner = ownerOf(span);
    if (owner === null) fileLevel.push(span);
    else {
      let group = groups.get(owner);
      if (group === undefined) groups.set(owner, (group = []));
      group.push(span);
    }
  }

  // A transaction holds at most 1000 spans. A file with more is split by whole tests into further
  // transactions in the same trace, each a child of the file's, so no test loses its spans. The
  // first holds the describe blocks and file-level hooks; a test in a later one hangs off its root.
  let dropped = Math.max(0, fileLevel.length - MAX_SPANS) + (collected?.droppedSpans ?? 0);
  const chunks: CollectedSpan[][] = [fileLevel.slice(0, MAX_SPANS)];
  for (const group of groups.values()) {
    const kept = group.slice(0, MAX_SPANS);
    dropped += group.length - kept.length;
    if (chunks.at(-1)!.length + kept.length > MAX_SPANS && chunks.at(-1)!.length > 0) chunks.push([]);
    chunks.at(-1)!.push(...kept);
  }
  /** The parent each span was sent with: an error event's trace context links to the same. */
  const sentParent = new Map<string, string>();

  // Sampled per file: a file's trace is whole or absent, and its issues link to it only when sent.
  const traced = collected !== null && spans.length > 0 && options.traces && (options.tracesSampleRate >= 1 || Math.random() < options.tracesSampleRate);
  if (traced) {
    chunks.forEach((chunk, index) => {
      const first = index === 0;
      const chunkSpanId = first ? rootSpanId : spanId();
      const ids = new Set(chunk.map((s) => s.span_id));
      const eventId = uuid();
      const payloadSpans = chunk.map((span) => {
        const parent = span.parent_span_id !== undefined && ids.has(span.parent_span_id) ? span.parent_span_id : chunkSpanId;
        sentParent.set(span.span_id, parent);
        return { ...span, trace_id: traceId, parent_span_id: parent, origin: ORIGIN };
      });
      const failed = chunk.some((s) => s.op === "test.case" && s.status !== "ok");
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
              ...(first ? { start_timestamp: collected.startedAt, timestamp: collected.endedAt } : bounds(chunk)),
              tags,
              contexts: {
                ...base.contexts,
                trace: {
                  trace_id: traceId,
                  span_id: chunkSpanId,
                  ...(first ? {} : { parent_span_id: rootSpanId }),
                  op: "test.file",
                  status: (first ? tests.some((t) => t.state === "fail") : failed) ? "internal_error" : "ok",
                  origin: ORIGIN,
                  ...((first && dropped) || chunks.length > 1 ? { data: { ...(first && dropped ? { "spans.dropped": dropped } : {}), ...(chunks.length > 1 ? { "test.part": index + 1, "test.parts": chunks.length } : {}) } } : {}),
                },
              },
              spans: payloadSpans,
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
    const record = collected?.tests[test.key];
    // A failing test's issue shows its last attempt; a flaky test's, the attempt that failed (its
    // first span under Jest, the one span holding every attempt under Vitest).
    const context: FailureContext | undefined = failed ? record?.failures.at(-1) : record?.failures[0];
    const attempt = failed ? record?.spanIds.at(-1) : record?.spanIds[0];
    // The runner's last error is the last attempt's (Vitest keeps every attempt's), the one the
    // capture is from. The capture has the error object itself: Jest's results can lose its name
    // (`TestingLibraryElementError` arrives as a plain Error).
    const reported = failed ? (test.errors.at(-1) ?? context?.error) : (context?.error ?? test.errors[0]);
    const error = reported !== undefined && !reported.name && context?.error?.name ? { ...reported, name: context.error.name } : reported;
    const attached = options.attachments ? (context?.attachments ?? []) : [];
    const exception = toException(error ?? { message: "Test failed" }, report.root, attached.map((a) => a.filename));
    // A flaky test's issue reads as one in every UI: the failed attempt's error under a FlakyTest
    // title (a chained exception would be titled by its first or last link depending on the UI).
    if (!failed) {
      exception.value = `${test.name} failed, then passed on retry ${test.retries}. The failed attempt:\n\n${exception.type}: ${exception.value}`;
      exception.type = "FlakyTest";
    }
    const testSpan = attempt === undefined ? undefined : byId.get(attempt);
    const eventId = uuid();
    const items: EnvelopeItem[] = [
      {
        type: "event",
        payload: {
          ...base,
          event_id: eventId,
          timestamp: testSpan?.timestamp ?? Date.now() / 1000,
          level: failed ? "error" : "warning",
          logger: `${report.runner}.test`,
          transaction: `${file} > ${test.name}`,
          fingerprint: [failed ? "sentry-tests.test-failure" : "sentry-tests.flaky-test", file, test.name],
          exception: { values: [exception] },
          tags: { ...tags, "test.name": tag(test.name), flaky: String(test.flaky), retries: String(test.retries) },
          contexts: {
            ...base.contexts,
            ...context?.contexts,
            ...(traced && attempt !== undefined ? { trace: { trace_id: traceId, span_id: attempt, parent_span_id: sentParent.get(attempt), op: "test.case" } } : {}),
            test: { name: test.name, file, duration_ms: test.duration, retries: test.retries, flaky: test.flaky },
          },
          breadcrumbs: { values: breadcrumbs((attempt !== undefined && groups.get(attempt)) || [], test.console ?? []) },
        },
      },
    ];
    for (const a of attached) items.push({ type: "attachment", filename: a.filename, contentType: a.contentType, payload: a.data });
    out.envelopes.push({ eventId, items });
    if (failed) out.failures++;
    else out.flaky++;
  }

  if (options.failures) {
    for (const { name, error } of outsideTests) {
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
              transaction: `${file} > ${name}`,
              fingerprint: ["sentry-tests.test-failure", file, name],
              exception: { values: [toException(error, report.root)] },
              tags: { ...tags, "test.name": tag(name), flaky: "false", retries: "0" },
              contexts: { ...base.contexts, test: { name, file } },
            },
          },
        ],
      });
      out.failures++;
    }
  }
  return out;
}

/** A part transaction's extent: its spans' earliest start and latest end. */
function bounds(spans: readonly CollectedSpan[]): { start_timestamp: number; timestamp: number } {
  let start = Infinity;
  let end = 0;
  for (const s of spans) {
    if (s.start_timestamp < start) start = s.start_timestamp;
    if (s.timestamp > end) end = s.timestamp;
  }
  return { start_timestamp: start, timestamp: end };
}

function tag(value: string): string {
  return value.length > MAX_TAG ? `${value.slice(0, MAX_TAG - 1)}…` : value;
}

/**
 * Where a Testing Library message starts dumping the page: the DOM (`Ignored nodes: …` then the
 * markup), the role listing, or @ctrl/dom's agent mode snapshot. Redundant once the page is attached.
 */
const PAGE_DUMP = /\n\n(?:Ignored nodes: |Here are the accessible roles:|Accessibility snapshot of <body>|DOM of <body>|<body)/;

function toException(error: ErrorInfo, root: string, attachments: readonly string[] = []): { type: string; value: string; [key: string]: unknown } {
  // Without terminal colors: Testing Library highlights the DOM in its messages under Jest.
  let text = stripVTControlCharacters(error.message);
  const dump = attachments.length > 0 ? PAGE_DUMP.exec(text) : null;
  if (dump !== null) text = `${text.slice(0, dump.index)}\n\n(The page when the test failed is attached: ${attachments.join(", ")}.)`;
  const message = text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text;
  // Vitest's parsed frames come newest first, like V8 prints them; Sentry wants oldest first.
  const frames = error.frames !== undefined ? [...error.frames].reverse() : parseStack(error.stack);
  return {
    type: error.name || "Error",
    value: message,
    mechanism: { type: "sentry-tests", handled: true },
    ...(frames.length > 0 ? { stacktrace: { frames: toSentryFrames(frames, root) } } : {}),
  };
}

/** What the test did and printed before it failed, oldest first: the issue page's breadcrumb timeline. */
function breadcrumbs(spans: readonly CollectedSpan[], output: readonly ConsoleEntry[]): Record<string, unknown>[] {
  const crumbs = [
    // The details go in the message, not `data`: Spotlight shows a breadcrumb's data instead of
    // its message, and Sentry shows both.
    ...spans
      .filter((s) => !NOT_BREADCRUMBS.has(s.op))
      .map((s) => ({
        type: "default",
        category: s.op,
        message: `${s.description} (${spanDetails(s)})`,
        timestamp: s.start_timestamp,
        level: s.status === "ok" ? "info" : "error",
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

/** `10.4 ms, 40 checks, 0 matches, 1994 ms skipped` */
function spanDetails(span: CollectedSpan): string {
  const ms = (span.timestamp - span.start_timestamp) * 1000;
  const parts = [`${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`];
  const { checks, matches } = span.data;
  if (typeof checks === "number") parts.push(`${checks} ${checks === 1 ? "check" : "checks"}`);
  if (typeof matches === "number") parts.push(`${matches} ${matches === 1 ? "match" : "matches"}`);
  const skipped = span.data["clock.skipped_ms"];
  if (typeof skipped === "number") parts.push(`${Math.round(skipped)} ms skipped`);
  return parts.join(", ");
}
