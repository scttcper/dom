// `@rtd/testing-library/agent` (published `@ctrl/dom/testing-library/agent`): support for
// @ctrl/dom's agent tooling that is not part of the @testing-library/dom API (docs/agent-debugging.md):
// - `matchAriaSnapshot`: Playwright-style aria snapshot matching, behind jest-dom's
//   `toMatchAriaSnapshot`;
// - failure snapshots: under `CTRL_DOM_DEBUG`, the Jest environment and the Vitest setup file
//   (vitest-environment-rtd/failure-snapshot) append one budgeted snapshot of `document.body` to
//   the error of every failing test, plus what changed since the last snapshot the test took.

import { ariaSnapshotLines, budgetLines, envMaxLines, lastBodySnapshot, resetBodySnapshot } from "./aria-snapshot.ts";
import { diffAriaSnapshots } from "./aria-snapshot-diff.ts";
import { ERROR_MAX_LINES, envDebugFormat } from "./agent-debug.ts";
import { prettyDOM } from "./pretty-dom.ts";
import { $impl } from "@rtd/dom/internal";

export { AriaTemplateError, matchAriaSnapshot, parseAriaTemplate, type AriaSnapshotMatch } from "./aria-snapshot-match.ts";
export { envDebugFormat } from "./agent-debug.ts";

/** Line budget for "what changed" in a failure report. */
const CHANGES_MAX_LINES = 40;

/** `document.body` as it was when a test failed, taken before cleanup unmounts it. */
export interface FailureSnapshot {
  format: "aria" | "compact";
  /** the snapshot within the line budget (`CTRL_DOM_DEBUG_LINES`, default 100) */
  text: string;
  /** the whole snapshot (aria only) */
  full: string;
  /** the last whole-page snapshot the test took before failing (aria only) */
  previous: string | undefined;
}

/** Forget the previous snapshot: call when a test starts. */
export function resetFailureSnapshot(document: any): void {
  resetBodySnapshot(document);
}

/** Snapshot `document.body` for a failure report; null when `CTRL_DOM_DEBUG` is unset or there is no body. */
export function captureFailureSnapshot(document: any): FailureSnapshot | null {
  const format = envDebugFormat();
  const body = document?.body;
  // Only our DOM (a jsdom document, e.g. a setup file left in a jsdom project, is not snapshotted).
  if (format === null || body == null || body[$impl] === undefined) return null;
  if (format === "compact") {
    const html = prettyDOM(body, undefined, { format: "compact" });
    return { format, text: String(html), full: "", previous: undefined };
  }
  const previous = lastBodySnapshot(document);
  const { lines, empty } = ariaSnapshotLines(body);
  const full = empty ?? lines.join("\n");
  const text = empty ?? budgetLines(lines, envMaxLines() ?? ERROR_MAX_LINES).join("\n");
  return { format, text, full, previous };
}

/**
 * The report appended to a failing test's error. A snapshot the error message already contains
 * (a failed query under `CTRL_DOM_DEBUG=aria` prints one) is not repeated.
 */
export function formatFailureSnapshot(snapshot: FailureSnapshot, errorMessage: string): string {
  if (snapshot.format === "compact") return `DOM of <body> when the test failed (CTRL_DOM_DEBUG=compact):\n${snapshot.text}`;
  if (errorMessage.includes(snapshot.text)) return "Accessibility snapshot of <body> when the test failed: the same as above.";
  let report = `Accessibility snapshot of <body> when the test failed (CTRL_DOM_DEBUG=aria):\n${snapshot.text}`;
  if (snapshot.previous !== undefined) {
    if (snapshot.previous === snapshot.full) report += "\n\nUnchanged since the previous snapshot in this test.";
    else report += `\n\nChanges since the previous snapshot in this test:\n${budgetLines(diffAriaSnapshots(snapshot.previous, snapshot.full).split("\n"), CHANGES_MAX_LINES).join("\n")}`;
  }
  return report;
}

/**
 * Append `text` to an error's message (and to its `stack`, which V8 formats with the message
 * once read). Works on Error objects and on the plain serialized errors test runners keep.
 */
export function appendToErrorMessage(error: unknown, text: string): boolean {
  if (error === null || typeof error !== "object") return false;
  const e = error as { message?: unknown; stack?: unknown };
  const message = typeof e.message === "string" ? e.message : "";
  let stack: unknown;
  try {
    stack = e.stack;
  } catch {
    stack = undefined;
  }
  const next = message === "" ? text : `${message}\n\n${text}`;
  try {
    e.message = next;
    if (typeof stack === "string") {
      const at = message === "" ? -1 : stack.indexOf(message);
      // No message in the stack (e.g. an empty one): put the text after the first line.
      if (at >= 0) e.stack = stack.slice(0, at) + next + stack.slice(at + message.length);
      else {
        const eol = stack.indexOf("\n");
        e.stack = eol < 0 ? `${stack}\n\n${text}` : `${stack.slice(0, eol)}\n\n${text}${stack.slice(eol)}`;
      }
    }
  } catch {
    return false;
  }
  return true;
}
