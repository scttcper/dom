// Reporting exceptions thrown by event listeners.
// https://html.spec.whatwg.org/#report-an-exception
// https://html.spec.whatwg.org/#report-the-error
//
// Decision (matches jsdom + the Vitest/Jest jsdom environments):
// 1. A listener that throws never stops dispatch; the exception is reported and the next
//    listener runs (https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke step 2.10).
// 2. Reporting dispatches a trusted, cancelable `ErrorEvent` named "error" (message, filename,
//    lineno, colno parsed from the stack, error) at the listener target's Window. `onerror`
//    returning true or any listener calling preventDefault() marks it handled.
// 3. If it was not handled, the uncaught-exception handler runs. The default mirrors jsdom's
//    virtual console forwarded to `console` (what jsdom does without a test environment):
//    `console.error(error.stack)`. Test environments replace it with
//    `setUncaughtExceptionHandler`. Vitest's jsdom environment instead adds an "error"
//    listener on the window that calls preventDefault() and re-emits the error as
//    `process.emit("uncaughtException", error)` when the test registered no "error" listener
//    of its own; that listener works unchanged against our windows, and
//    vitest-environment-rtd should do the same (or install a handler here that does it) so
//    uncaught listener errors fail tests exactly like under jsdom.
// 4. Re-entrancy: an exception thrown while reporting (e.g. by an "error" listener) goes
//    straight to the uncaught-exception handler instead of dispatching another ErrorEvent
//    (jsdom's "error reporting mode").

import type { EventTarget } from "./EventTarget.ts";
import { ErrorEvent } from "./events.ts";
import { setTrusted } from "./Event.ts";
import { dispatch } from "./dispatch.ts";
import { currentWindow } from "../window/current.ts";
import { $impl, $window } from "../keys.ts";

export type UncaughtExceptionHandler = (error: unknown, event: ErrorEvent | null) => void;

function defaultUncaughtExceptionHandler(error: unknown): void {
  const stack = error !== null && typeof error === "object" ? (error as { stack?: unknown }).stack : undefined;
  console.error(typeof stack === "string" ? stack : `Uncaught ${String(error)}`);
}

let uncaughtExceptionHandler: UncaughtExceptionHandler = defaultUncaughtExceptionHandler;

/** Replace what happens to listener exceptions nobody handled. Pass null to restore the default. */
export function setUncaughtExceptionHandler(handler: UncaughtExceptionHandler | null): void {
  uncaughtExceptionHandler = handler ?? defaultUncaughtExceptionHandler;
}

const reporting = new WeakSet<object>();

function windowFor(target: EventTarget | null): EventTarget | null {
  if (target !== null) {
    const t = target as unknown as { [$impl]?: { doc: { [$window]: EventTarget | null } }; document?: { [$window]?: unknown } };
    if (t[$impl] !== undefined) return t[$impl].doc[$window];
    const doc = t.document;
    if (doc !== undefined && doc !== null && doc[$window] === target) return target;
  }
  try {
    return currentWindow() as unknown as EventTarget;
  } catch {
    return null;
  }
}

function parseLocation(error: unknown): { filename: string; lineno: number; colno: number } {
  const stack = error !== null && typeof error === "object" ? (error as { stack?: unknown }).stack : undefined;
  if (typeof stack === "string") {
    const lines = stack.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const m = /at (?:.+\s+)?\(?(.+?):(\d+):(\d+)\)?$/.exec(lines[i].trim());
      if (m !== null) return { filename: m[1], lineno: Number(m[2]), colno: Number(m[3]) };
    }
  }
  return { filename: "", lineno: 0, colno: 0 };
}

/**
 * https://html.spec.whatwg.org/#report-an-exception
 * `target` is the EventTarget whose listener threw (used to find the window).
 */
export function reportException(error: unknown, target: EventTarget | null): void {
  const window = windowFor(target);
  if (window === null || reporting.has(window)) {
    uncaughtExceptionHandler(error, null);
    return;
  }
  const { filename, lineno, colno } = parseLocation(error);
  const message =
    error !== null && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : `Uncaught ${String(error)}`;
  const event = new ErrorEvent("error", { cancelable: true, message, filename, lineno, colno, error });
  setTrusted(event);
  reporting.add(window);
  let handled = false;
  try {
    handled = !dispatch(event, window);
  } finally {
    reporting.delete(window);
  }
  if (!handled) uncaughtExceptionHandler(error, event);
}
