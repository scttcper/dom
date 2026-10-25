// Runs in the test worker: collects the spans @ctrl/dom's packages publish on its tracing channel
// (@rtd/dom trace.ts) for one test at a time, and what the page looked like when a test failed.
// The Vitest setup file (vitest-setup.ts) and the Jest environment (jest-collector.ts) drive it;
// the reporters turn what it collects into Sentry events in the main process (report.ts).
//
// Spans nest through AsyncLocalStorage bound to the channel's start event, so a query inside a
// waitFor callback is that waitFor's child even across awaits. Times come from the real clock:
// the environment's Date and performance are the virtual clock's, which skips idle time.

import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { clockStats, spanChannel, type SpanContext } from "@rtd/dom/internal";
import { ariaSnapshot, prettyDOM } from "@rtd/testing-library";
import { spanId } from "./envelope.ts";

/** A finished span, in Sentry's span shape minus the trace id (report.ts adds it). */
export interface CollectedSpan {
  span_id: string;
  /** Absent for a top-level span: report.ts makes it a child of the test's span. */
  parent_span_id?: string;
  op: string;
  description: string;
  start_timestamp: number;
  timestamp: number;
  status: "ok" | "internal_error";
  data: Record<string, string | number | boolean>;
}

/** The page when a test (attempt) failed, before cleanup unmounted it. */
export interface FailureContext {
  error?: { name?: string; message: string; stack?: string };
  aria?: string;
  html?: string;
  clock?: { skippedMs: number; pendingTimers: number };
}

export interface CollectedTest {
  /** Epoch seconds, real clock. */
  startedAt: number;
  endedAt?: number;
  spans: CollectedSpan[];
  /** Spans past the per-test limit. */
  droppedSpans: number;
  /** One per failed attempt (a flaky test has failures and passes). */
  failures: FailureContext[];
}

/** Spans kept per test: a waitFor polling a query can publish hundreds. */
const MAX_SPANS = 300;
const MAX_HTML = 200_000;
const MAX_ARIA_LINES = 2000;

/** Epoch seconds from the real clock (perf_hooks', not the environment's virtual performance). */
export const realNow = (): number => (performance.timeOrigin + performance.now()) / 1000;

interface Open {
  span: CollectedSpan;
  test: CollectedTest;
  skippedAtStart: number;
}

const OPEN = Symbol("ctrl-dom.sentry.span");

export interface Collector {
  /** Start a test (or a retry of one): later spans belong to it. */
  beginTest(previous?: CollectedTest | null): CollectedTest;
  /** Finish the current test and return what was collected. */
  endTest(): CollectedTest | null;
  /** Record the page and the error for the current test's failed attempt. */
  captureFailure(document: unknown, error?: unknown): void;
  /** Unsubscribe (the end of a test file). */
  stop(): void;
}

/** Subscribe to @ctrl/dom's tracing channel. Without one (no tracing channels in the runtime), only test timing and failures are collected. */
export function startCollecting(): Collector {
  const channel = spanChannel();
  const current = new AsyncLocalStorage<CollectedSpan>();
  let test: CollectedTest | null = null;

  const open = (context: SpanContext): CollectedSpan | undefined => {
    if (test === null) return current.getStore();
    const parent = current.getStore();
    const span: CollectedSpan = {
      span_id: spanId(),
      ...(parent !== undefined ? { parent_span_id: parent.span_id } : {}),
      op: context.op,
      description: context.description,
      start_timestamp: realNow(),
      timestamp: 0,
      status: "ok",
      data: context.data,
    };
    (context as SpanContext & { [OPEN]?: Open })[OPEN] = { span, test, skippedAtStart: clockStats()?.skippedMs ?? 0 };
    return span;
  };

  const close = (context: SpanContext): void => {
    const state = (context as SpanContext & { [OPEN]?: Open })[OPEN];
    if (state === undefined) return;
    const { span, test: owner } = state;
    span.timestamp = realNow();
    if (context.error !== undefined) span.status = "internal_error";
    const skipped = (clockStats()?.skippedMs ?? 0) - state.skippedAtStart;
    if (skipped > 0) span.data["clock.skipped_ms"] = Math.round(skipped);
    if (owner.spans.length < MAX_SPANS) owner.spans.push(span);
    else owner.droppedSpans++;
  };

  const subscribers = {
    start() {},
    end(context: SpanContext) {
      // A promise span ends at asyncEnd, unless it threw before returning a promise.
      if (!context.async || context.error !== undefined) close(context);
    },
    asyncStart() {},
    asyncEnd(context: SpanContext) {
      close(context);
    },
    error() {},
  };
  if (channel !== null) {
    channel.start.bindStore(current as never, open as never);
    channel.subscribe(subscribers as never);
  }

  return {
    beginTest(previous) {
      test = { startedAt: realNow(), spans: [], droppedSpans: 0, failures: previous?.failures ?? [] };
      return test;
    },
    endTest() {
      const done = test;
      if (done !== null) done.endedAt = realNow();
      test = null;
      return done;
    },
    captureFailure(document, error) {
      test?.failures.push(captureFailureContext(document, error));
    },
    stop() {
      if (channel === null) return;
      channel.unsubscribe(subscribers as never);
      channel.start.unbindStore(current as never);
    },
  };
}

function captureFailureContext(document: unknown, error: unknown): FailureContext {
  const context: FailureContext = {};
  if (error !== null && typeof error === "object" && typeof (error as Error).message === "string") {
    const e = error as Error;
    context.error = { name: e.name, message: e.message, stack: typeof e.stack === "string" ? e.stack : undefined };
  }
  const doc = document as { body?: { outerHTML?: string } } | null | undefined;
  if (doc?.body != null) {
    try {
      context.aria = ariaSnapshot(doc.body as never, { maxLines: MAX_ARIA_LINES });
    } catch {
      // A document that is not ours (a jsdom project) has no snapshot.
    }
    // The body as indented markup, without <style>/<script> (CSS-in-JS fills the head with them)
    // and without terminal colors: readable in Sentry's attachment viewer.
    let html: string | undefined;
    try {
      const pretty = prettyDOM(doc.body as never, MAX_HTML, { highlight: false });
      html = typeof pretty === "string" ? pretty : undefined;
    } catch {
      html = doc.body.outerHTML;
    }
    if (typeof html === "string") context.html = html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}\n<!-- truncated -->` : html;
  }
  const clock = clockStats();
  if (clock !== null) context.clock = clock;
  return context;
}
