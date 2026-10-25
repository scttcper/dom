// Sentry's wire format, written directly rather than through an SDK: the reporters only send a few
// events per test file from the main process, so a DSN, an envelope serializer and `fetch` are all
// they need, and @ctrl/dom keeps no Sentry dependency.
//
// https://develop.sentry.dev/sdk/data-model/envelopes/
// https://develop.sentry.dev/sdk/overview/#parsing-the-dsn

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface Dsn {
  /** The DSN as given. */
  dsn: string;
  /** Where envelopes go, with the key in the query string. */
  url: string;
  host: string;
  projectId: string;
}

/** https://develop.sentry.dev/sdk/overview/#parsing-the-dsn */
export function parseDsn(dsn: string): Dsn {
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    throw new Error(`@ctrl/dom/sentry: invalid DSN ${JSON.stringify(dsn)}`);
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  const projectId = segments.pop();
  if (!parsed.username || projectId === undefined) throw new Error(`@ctrl/dom/sentry: invalid DSN ${JSON.stringify(dsn)} (expected https://<key>@<host>/<project>)`);
  const prefix = segments.length > 0 ? `/${segments.join("/")}` : "";
  const query = new URLSearchParams({ sentry_key: parsed.username, sentry_version: "7", sentry_client: `${SDK.name}/${SDK.version}` });
  return { dsn, url: `${parsed.protocol}//${parsed.host}${prefix}/api/${projectId}/envelope/?${query}`, host: parsed.host, projectId };
}

export const SDK = { name: "ctrl-dom.test-reporter", version: "0.0.0" };

/** 32 hex characters (event and trace ids). */
export const uuid = (): string => randomUUID().replaceAll("-", "");
/** 16 hex characters. */
export const spanId = (): string => randomBytes(8).toString("hex");

export type EnvelopeItem =
  | { type: "event" | "transaction"; payload: Record<string, unknown> }
  | { type: "attachment"; filename: string; contentType: string; payload: string };

export interface Envelope {
  eventId: string;
  items: EnvelopeItem[];
}

const encoder = new TextEncoder();

/** https://develop.sentry.dev/sdk/data-model/envelopes/#serialization-format */
export function serializeEnvelope(envelope: Envelope, dsn: Dsn | null): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const line = (text: string) => parts.push(encoder.encode(`${text}\n`));
  line(JSON.stringify({ event_id: envelope.eventId, sent_at: new Date().toISOString(), sdk: SDK, ...(dsn ? { dsn: dsn.dsn } : {}) }));
  for (const item of envelope.items) {
    const payload = encoder.encode(typeof item.payload === "string" ? item.payload : JSON.stringify(item.payload));
    const header =
      item.type === "attachment"
        ? { type: "attachment", length: payload.byteLength, filename: item.filename, content_type: item.contentType, attachment_type: "event.attachment" }
        : { type: item.type, length: payload.byteLength };
    line(JSON.stringify(header));
    parts.push(payload, encoder.encode("\n"));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

export interface Target {
  /** "sentry.io" for a DSN's host, or "Spotlight". */
  label: string;
  url: string;
  dsn: Dsn | null;
}

/** POST one envelope; resolves to an error message, or null when it was accepted. */
export async function sendEnvelope(envelope: Envelope, target: Target): Promise<string | null> {
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body: serializeEnvelope(envelope, target.dsn),
    });
    if (response.ok) return null;
    return `${target.label} answered ${response.status} ${(await response.text().catch(() => "")).slice(0, 200)}`.trim();
  } catch (error) {
    return `${target.label}: ${(error as Error).message}`;
  }
}

// --- stack traces ----------------------------------------------------------------------------

/** https://develop.sentry.dev/sdk/data-model/event-payloads/stacktrace/#frame-attributes */
export interface Frame {
  filename: string;
  abs_path: string;
  function?: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
  pre_context?: string[];
  context_line?: string;
  post_context?: string[];
}

/** A frame as a test runner already parsed (and source-mapped) it: Vitest's `error.stacks`. */
export interface ParsedFrame {
  method?: string;
  file: string;
  line?: number;
  column?: number;
}

// V8: "    at fn (file:line:col)", "    at file:line:col", "    at async fn (file:line:col)".
const V8_FRAME = /^\s*at (?:(?:async )?(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

/** V8 stack lines as frames, oldest first (Sentry's order). */
export function parseStack(stack: string | undefined): ParsedFrame[] {
  if (!stack) return [];
  const frames: ParsedFrame[] = [];
  for (const line of stack.split("\n")) {
    const m = V8_FRAME.exec(line);
    if (m !== null) frames.push({ method: m[1], file: m[2], line: Number(m[3]), column: Number(m[4]) });
  }
  return frames.reverse();
}

const sources = new Map<string, string[] | null>();

function sourceLines(path: string): string[] | null {
  let lines = sources.get(path);
  if (lines === undefined) {
    try {
      lines = readFileSync(path, "utf8").split("\n");
    } catch {
      lines = null;
    }
    sources.set(path, lines);
  }
  return lines;
}

const CONTEXT_LINES = 5;

/**
 * Sentry frames from parsed ones, oldest first: paths relative to `root`, the test's own code in
 * app (not node_modules or Node's internals), with source context read from disk (Sentry cannot
 * fetch a local file).
 */
export function toSentryFrames(frames: readonly ParsedFrame[], root: string): Frame[] {
  return frames.map((f) => {
    const absPath = f.file.startsWith("file://") ? fileURLToPath(f.file) : f.file;
    const local = isAbsolute(absPath);
    const inApp = local && !absPath.includes("/node_modules/");
    const frame: Frame = {
      filename: local ? relative(root, absPath) : absPath,
      abs_path: absPath,
      ...(f.method ? { function: f.method } : {}),
      ...(f.line !== undefined ? { lineno: f.line } : {}),
      ...(f.column !== undefined ? { colno: f.column } : {}),
      in_app: inApp,
    };
    const lines = inApp && f.line !== undefined ? sourceLines(absPath) : null;
    if (lines !== null && f.line! >= 1 && f.line! <= lines.length) {
      const at = f.line! - 1;
      frame.pre_context = lines.slice(Math.max(0, at - CONTEXT_LINES), at);
      frame.context_line = lines[at];
      frame.post_context = lines.slice(at + 1, at + 1 + CONTEXT_LINES);
    }
    return frame;
  });
}
