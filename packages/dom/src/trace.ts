// Test observability: Testing Library queries and waitFor, user-event actions and React's render
// publish start/end events on one `node:diagnostics_channel` tracing channel, which
// @ctrl/sentry-tests (or anything else) can subscribe to. Nothing is formatted, measured or
// allocated unless something subscribes: call sites check `tracing()` before building a span.
// And when @ctrl/sentry-tests reports a failed test, the environments attach the page's
// accessibility snapshot and the virtual clock to it (subscribeTestFailures).
//
// https://nodejs.org/api/diagnostics_channel.html#class-tracingchannel

import * as diagnosticsChannel from "node:diagnostics_channel";
import { $impl } from "./keys.ts";
import { clockSkipped, clockStats } from "./window/clock.ts";

/** The context object a span's start/end/asyncStart/asyncEnd/error events carry. */
export interface SpanContext {
  /** Sentry-style operation: "testing-library.query", "user-event.click", "react.render", ... */
  op: string;
  /** What ran, as the test wrote it: `getByRole("button", { name: "Save" })`. */
  description: string;
  /**
   * Filled in by the traced code before the span ends (match counts, waitFor checks), and with
   * `clock.skipped_ms` when the virtual clock skipped idle time during it.
   */
  data: Record<string, string | number | boolean>;
  /** True for promise-returning work: the span ends at asyncEnd rather than end. */
  async: boolean;
  /** Set by the tracing channel when the traced function throws or rejects. */
  error?: unknown;
}

export const SPAN_CHANNEL = "ctrl-dom:span";

type Channel = diagnosticsChannel.TracingChannel<SpanContext, SpanContext>;

// Bun and older runtimes may lack tracing channels: then nothing is ever traced.
const channel: Channel | null =
  typeof diagnosticsChannel.tracingChannel === "function" ? (diagnosticsChannel.tracingChannel(SPAN_CHANNEL) as Channel) : null;

/** The tracing channel, for subscribers. Null where the runtime has none. */
export function spanChannel(): Channel | null {
  return channel;
}

/** Whether a span would be recorded: check this before formatting a description. */
export function tracing(): boolean {
  return channel !== null && channel.hasSubscribers;
}

/** Run `fn` as a span. Call only when `tracing()` is true. */
export function traceSync<T>(op: string, description: string, fn: (span: SpanContext) => T): T {
  const span: SpanContext = { op, description, data: {}, async: false };
  const skipped = clockSkipped();
  return channel!.traceSync(
    (s: SpanContext) => {
      try {
        return fn(s);
      } finally {
        recordSkipped(s, skipped);
      }
    },
    span,
    undefined,
    span,
  );
}

/** Run promise-returning `fn` as a span that ends when the promise settles. Call only when `tracing()` is true. */
export function tracePromise<T>(op: string, description: string, fn: (span: SpanContext) => Promise<T>): Promise<T> {
  const span: SpanContext = { op, description, data: {}, async: true };
  const skipped = clockSkipped();
  // The tracing channel's asyncEnd waits for the promise returned here, so the data is in place.
  return channel!.tracePromise((s: SpanContext) => fn(s).finally(() => recordSkipped(s, skipped)), span, undefined, span);
}

/** How much idle time the virtual clock skipped while the span ran (a findBy's timeout, a debounce). */
function recordSkipped(span: SpanContext, before: number): void {
  const skipped = clockSkipped() - before;
  if (skipped > 0) span.data["clock.skipped_ms"] = Math.round(skipped);
}

const MAX_DESCRIPTION = 160;

/** `name(arg, arg, ...)` with each argument short and readable, for a span description. */
export function describeCall(name: string, args: readonly unknown[]): string {
  let out = `${name}(`;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === undefined && i === args.length - 1) break;
    out += (i > 0 ? ", " : "") + describeValue(args[i], 0);
    if (out.length > MAX_DESCRIPTION) return `${out.slice(0, MAX_DESCRIPTION - 1)}…)`;
  }
  return `${out})`;
}

function describeValue(value: unknown, depth: number): string {
  if (typeof value === "string") return JSON.stringify(value.length > 40 ? `${value.slice(0, 39)}…` : value);
  if (typeof value === "function") return value.name ? `${value.name}()` : "fn";
  if (value instanceof RegExp) return String(value);
  if (value === null || typeof value !== "object") return String(value);
  if ((value as Record<symbol, unknown>)[$impl] !== undefined) return describeNode(value);
  if (Array.isArray(value)) return depth > 0 ? "[…]" : `[${value.slice(0, 3).map((v) => describeValue(v, depth + 1)).join(", ")}${value.length > 3 ? ", …" : ""}]`;
  if (depth > 0) return "{…}";
  const entries = Object.entries(value).slice(0, 4);
  if (entries.length === 0) return "{}";
  return `{ ${entries.map(([k, v]) => `${k}: ${describeValue(v, depth + 1)}`).join(", ")} }`;
}

let nodeDescriber: ((node: unknown) => string | null) | null = null;

/**
 * Lets a higher layer name elements in span descriptions: @ctrl/dom/aria registers role and accessible
 * name (`button "Save"`), the way queries find them. Called only while tracing.
 */
export function setNodeDescriber(describer: ((node: unknown) => string | null) | null): void {
  nodeDescriber = describer;
}

/** An element as a span description shows it: `button "Save"` (see setNodeDescriber), else `<input "Email">`. */
export function describeNode(node: unknown): string {
  const n = node as { nodeType?: number; localName?: string; getAttribute?: (name: string) => string | null; textContent?: string | null };
  if (n.nodeType === 9) return "document";
  if (n.nodeType !== 1 || typeof n.localName !== "string") return n.nodeType === 3 ? "#text" : "node";
  if (nodeDescriber !== null) {
    try {
      const described = nodeDescriber(node);
      if (described) return described;
    } catch {
      // A description must never break the traced call.
    }
  }
  // The page's roots: their text is the whole page.
  if (n.localName === "body" || n.localName === "html") return `<${n.localName}>`;
  // Not ids: libraries generate them (`react-aria-_r_2_`, `base-ui-_r_0_`).
  const label = n.getAttribute?.("aria-label") || n.textContent?.trim().replace(/\s+/g, " ") || n.getAttribute?.("placeholder") || n.getAttribute?.("name") || "";
  return label === "" ? `<${n.localName}>` : `<${n.localName} ${quote(label)}>`;
}

/** A short JSON string: names and labels in descriptions stay under ~40 characters. */
export function quote(text: string): string {
  return JSON.stringify(text.length > 40 ? `${text.slice(0, 39)}…` : text);
}

// --- failed tests (@ctrl/sentry-tests) -------------------------------------------------------

/** What @ctrl/sentry-tests publishes on "sentry-tests:failure" (its channels.ts), as read here. */
interface FailureMessage {
  document: unknown;
  attachments: Array<{ filename: string; contentType: string; data: string }>;
  contexts: Record<string, Record<string, unknown>>;
}

export const FAILURE_CHANNEL = "sentry-tests:failure";

let failureSnapshot: ((body: unknown) => string) | null = null;

/**
 * Lets a higher layer describe the page of a failed test: @ctrl/dom/testing-library registers its
 * accessibility snapshot. Called only when a test fails with @ctrl/sentry-tests reporting.
 */
export function setFailureSnapshot(snapshot: ((body: unknown) => string) | null): void {
  failureSnapshot = snapshot;
}

/**
 * While an environment runs, add the page's accessibility snapshot and the virtual clock to the
 * failures @ctrl/sentry-tests reports from it (only those of `getDocument()`'s document: another
 * environment's subscriber may be listening in the same process). Returns the unsubscribe.
 */
export function subscribeTestFailures(getDocument: () => unknown): () => void {
  const failures = diagnosticsChannel.channel(FAILURE_CHANNEL);
  const onFailure = (message: unknown): void => {
    const m = message as FailureMessage;
    const document = getDocument() as { body?: unknown } | null | undefined;
    if (document == null || m.document !== document) return;
    const clock = clockStats();
    if (clock !== null) m.contexts.clock = { skipped_ms: Math.round(clock.skippedMs), pending_timers: clock.pendingTimers };
    if (failureSnapshot === null || document.body == null) return;
    try {
      m.attachments.push({ filename: "accessibility-snapshot.txt", contentType: "text/plain", data: failureSnapshot(document.body) });
    } catch {
      // A snapshot must never turn a test failure into a crash.
    }
  };
  failures.subscribe(onFailure);
  return () => failures.unsubscribe(onFailure);
}
