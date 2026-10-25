// Runs in the test worker and records one test file as a tree of spans: the runner's structure
// (describe blocks, tests, hooks, test functions), driven by the Vitest runner (vitest-runner.ts)
// or Jest's events (jest-collector.ts), and under it the spans libraries publish on the tracing
// channels (channels.ts), plus what each failed test left behind. The reporters turn the result
// into Sentry events in the main process (report.ts).
//
// The current span lives in AsyncLocalStorage, so a span started inside a test function's awaits
// still nests under that test function; Jest's runner, which only reports events, sets a fallback
// parent instead (`enter`). Times come from perf_hooks' clock, which fake timers and @ctrl/dom's
// virtual clock leave alone.

import { AsyncLocalStorage } from "node:async_hooks";
import * as diagnosticsChannel from "node:diagnostics_channel";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { FAILURE_CHANNEL, SPAN_CHANNELS, type Attachment, type FailureMessage, type SpanContext } from "./channels.ts";
import { spanId } from "./envelope.ts";
import { pageHtml } from "./html.ts";

/** A finished span, in Sentry's span shape minus the trace id (report.ts adds it). */
export interface CollectedSpan {
  span_id: string;
  /** Absent for a span directly under the file. */
  parent_span_id?: string;
  op: string;
  description: string;
  start_timestamp: number;
  timestamp: number;
  status: "ok" | "internal_error";
  data: Record<string, string | number | boolean>;
}

/** What a failed test (attempt) left behind, captured before its afterEach hooks ran. */
export interface FailureContext {
  error?: { name?: string; message: string; stack?: string };
  attachments: Attachment[];
  contexts: Record<string, Record<string, unknown>>;
}

export interface CollectedTest {
  /** Its "test.case" spans, one per attempt under Jest (Vitest's one span holds every attempt). */
  spanIds: string[];
  /** Library spans past the per-test limit. */
  droppedSpans: number;
  /** One per failed attempt: a flaky test has failures and a pass. */
  failures: FailureContext[];
}

/** One test file: what the worker hands the reporter. */
export interface CollectedFile {
  /** Epoch seconds. */
  startedAt: number;
  endedAt: number;
  /** In end order; report.ts sorts them. */
  spans: CollectedSpan[];
  /** By the runner's key for the test: Vitest's test id, Jest's full test name. */
  tests: Record<string, CollectedTest>;
  /** Library spans outside any test past the file's limit. */
  droppedSpans: number;
}

/** A span that is still running. */
export interface OpenSpan {
  readonly span: CollectedSpan;
  /** The test it belongs to, which its library spans count against. */
  readonly test: CollectedTest | null;
}

/** Library spans kept per test (a waitFor polling a query can publish hundreds), and outside tests. */
const MAX_TEST_SPANS = 300;
const MAX_FILE_SPANS = 1000;
const MAX_ATTACHMENT = 200_000;
const MAX_WAIT_MS = 5000;

/** Epoch seconds from the real clock. */
export const realNow = (): number => (performance.timeOrigin + performance.now()) / 1000;

const OPEN = Symbol("sentry-tests.span");
type Traced = SpanContext & { [OPEN]?: OpenSpan };

export interface Collector {
  /** Start a structure span under the current one; with `test`, a span of that test. */
  open(op: string, description: string, data?: Record<string, string | number | boolean>, test?: CollectedTest): OpenSpan;
  close(open: OpenSpan, failed?: boolean): void;
  /** Run `fn` with `open` as the current span. */
  run<T>(open: OpenSpan, fn: () => T): T;
  /** The span later spans would nest under. */
  current(): OpenSpan | null;
  /** The parent for spans that no async context places (event-driven runners). */
  enter(open: OpenSpan | null): void;
  /** The test with this key, created on first use. */
  test(key: string): CollectedTest;
  /** Record a failed attempt: the error, the page and whatever "sentry-tests:failure" subscribers add. */
  captureFailure(test: CollectedTest, name: string, error: unknown, document: unknown): Promise<void>;
  /** Everything recorded since the last finish(), and start over. */
  finish(): CollectedFile;
  /** Unsubscribe from the tracing channels. */
  stop(): void;
}

export function createCollector(): Collector {
  const current = new AsyncLocalStorage<OpenSpan>();
  let entered: OpenSpan | null = null;
  let file = emptyFile();
  const parent = (): OpenSpan | null => current.getStore() ?? entered;

  const counts = new WeakMap<CollectedTest, number>();
  const countOf = (test: CollectedTest): number => counts.get(test) ?? 0;
  let fileCount = 0;

  const open: Collector["open"] = (op, description, data = {}, test) => {
    const up = parent();
    const now = realNow();
    if (file.startedAt === 0) file.startedAt = now;
    return {
      span: { span_id: spanId(), ...(up !== null ? { parent_span_id: up.span.span_id } : {}), op, description, start_timestamp: now, timestamp: 0, status: "ok", data },
      test: test ?? up?.test ?? null,
    };
  };

  // A library span outside everything (module scope, a timer after the test ended) is not
  // recorded. Past the limit a span is not created at all, so whatever it starts nests under its
  // parent instead and no kept span points at a dropped one.
  const openTraced = (context: Traced): OpenSpan | undefined => {
    const up = parent();
    if (up === null) return undefined;
    const owner = up.test;
    if (owner !== null ? countOf(owner) >= MAX_TEST_SPANS : fileCount >= MAX_FILE_SPANS) {
      if (owner !== null) owner.droppedSpans++;
      else file.droppedSpans++;
      return up;
    }
    if (owner !== null) counts.set(owner, countOf(owner) + 1);
    else fileCount++;
    const span = open(context.op, context.description, context.data);
    context[OPEN] = span;
    return span;
  };

  const closeTraced = (context: Traced): void => {
    const span = context[OPEN];
    if (span === undefined) return;
    context[OPEN] = undefined;
    span.span.data = context.data;
    close(span, context.error !== undefined);
  };

  const close: Collector["close"] = (o, failed = false) => {
    o.span.timestamp = realNow();
    if (failed) o.span.status = "internal_error";
    file.spans.push(o.span);
  };

  const subscribers = {
    start() {},
    end(context: Traced) {
      // A promise span ends at asyncEnd, unless it threw before returning a promise.
      if (!context.async || context.error !== undefined) closeTraced(context);
    },
    asyncStart() {},
    asyncEnd(context: Traced) {
      closeTraced(context);
    },
    error() {},
  };
  // Bun and older runtimes may lack tracing channels: then only the runner's spans are recorded.
  const channels = typeof diagnosticsChannel.tracingChannel === "function" ? SPAN_CHANNELS.map((name) => diagnosticsChannel.tracingChannel<Traced, Traced>(name)) : [];
  for (const channel of channels) {
    channel.start.bindStore(current as never, openTraced as never);
    channel.subscribe(subscribers as never);
  }
  const failures = diagnosticsChannel.channel(FAILURE_CHANNEL);

  return {
    open,
    close,
    run: (o, fn) => current.run(o, fn),
    current: parent,
    enter(o) {
      entered = o;
    },
    test(key) {
      return (file.tests[key] ??= { spanIds: [], droppedSpans: 0, failures: [] });
    },
    async captureFailure(test, name, error, document) {
      const context: FailureContext = { attachments: [], contexts: {} };
      if (error !== null && typeof error === "object" && typeof (error as Error).message === "string") {
        const e = error as Error;
        context.error = { name: e.name, message: e.message, stack: typeof e.stack === "string" ? e.stack : undefined };
      }
      const html = pageHtml(document, MAX_ATTACHMENT);
      if (html !== undefined) context.attachments.push({ filename: "page.html", contentType: "text/html", data: html });
      if (failures.hasSubscribers) {
        const pending: Promise<unknown>[] = [];
        const message: FailureMessage = { test: name, error, document, attachments: [], contexts: context.contexts, waitUntil: (p) => void pending.push(p) };
        failures.publish(message);
        if (pending.length > 0) await Promise.race([Promise.allSettled(pending), delay(MAX_WAIT_MS, undefined, { ref: false })]);
        for (const a of message.attachments) {
          if (typeof a?.filename !== "string" || typeof a.data !== "string" || context.attachments.some((b) => b.filename === a.filename)) continue;
          context.attachments.push({ filename: a.filename, contentType: a.contentType || "text/plain", data: a.data.length > MAX_ATTACHMENT ? a.data.slice(0, MAX_ATTACHMENT) : a.data });
        }
      }
      test.failures.push(context);
    },
    finish() {
      const done = file;
      done.endedAt = realNow();
      file = emptyFile();
      fileCount = 0;
      entered = null;
      return done;
    },
    stop() {
      for (const channel of channels) {
        channel.unsubscribe(subscribers as never);
        channel.start.unbindStore(current as never);
      }
    },
  };
}

function emptyFile(): CollectedFile {
  return { startedAt: 0, endedAt: 0, spans: [], tests: {}, droppedSpans: 0 };
}
