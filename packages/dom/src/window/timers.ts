// Window-owned host timers.
//
// https://html.spec.whatwg.org/#timers — "the map of active timers" belongs to the global, and
// closing a browsing context (https://html.spec.whatwg.org/#close-a-browsing-context) leaves no
// timer of that global able to run. jsdom implements exactly that: `window.close()` clears every
// pending timer and later setTimeout/setInterval calls return 0 without scheduling anything.
//
// @ctrl/dom's timers stay the *host's* (Node's, or a fake clock's): handles are Node Timeout
// objects and Vitest/Jest fake timers replace the global functions (docs/deviations.md). What
// we add is bookkeeping: every handle created through the window's setTimeout/setInterval (or
// through the installed global's, see trackGlobalTimers) is remembered on the window together
// with the clear function of the host that created it, and close() clears the ones still
// pending. Without it, long app timers (TanStack Query's 5 min GC timers, polling intervals)
// keep a finished Jest test file's vm context and module graph alive until they fire.
//
// Per-call cost is one Map.set. Fired one-shot and cleared Node timers are dropped lazily: when
// the map reaches `sweepAt` entries, handles Node has marked `_destroyed` are removed and the
// threshold doubles relative to what is left (amortized O(1), no callback wrapping, no
// per-call closure). Handles without that flag (a fake clock's) stay until close().

import type { Window } from "./Window.ts";
import { $closed, $timers } from "../keys.ts";

type ClearFunction = (handle: never) => void;
type HostTimerFunction = (handler: unknown, timeout?: unknown, ...args: unknown[]) => unknown;

const SWEEP_MIN = 256;

/** The pending host timers of one window. */
export class TimerList {
  handles: Map<unknown, ClearFunction>;
  sweepAt: number;

  constructor() {
    this.handles = new Map();
    this.sweepAt = SWEEP_MIN;
  }
}

/** Remember `handle` (created by a host whose clear function is `clear`) on `window`. */
export function trackTimer(window: Window, handle: unknown, clear: ClearFunction): void {
  const list = (window[$timers] ??= new TimerList());
  const handles = list.handles;
  if (handles.size >= list.sweepAt) sweep(list);
  handles.set(handle, clear);
}

function sweep(list: TimerList): void {
  const handles = list.handles;
  for (const handle of handles.keys()) {
    // Node sets `_destroyed` once a one-shot Timeout ran or any Timeout was cleared.
    if (typeof handle === "object" && handle !== null && (handle as { _destroyed?: boolean })._destroyed === true)
      handles.delete(handle);
  }
  list.sweepAt = Math.max(SWEEP_MIN, handles.size * 2);
}

/** close(): clear every timer still pending on `window`. */
export function clearTimers(window: Window): void {
  const list = window[$timers];
  if (list === null) return;
  window[$timers] = null;
  for (const [handle, clear] of list.handles) {
    try {
      clear(handle as never);
    } catch {
      // A fake clock that has since been uninstalled may refuse foreign handles; nothing pends there.
    }
  }
  list.handles.clear();
}

/**
 * The timeout the timer initialisation steps work with: the IDL argument is a `long`
 * (https://webidl.spec.whatwg.org/#es-long: truncated, wrapped to 32 bits, NaN to 0) and a
 * negative one is 0 (https://html.spec.whatwg.org/#timer-initialisation-steps), as in jsdom.
 * Node's setTimeout would warn instead (TimeoutNegativeWarning, TimeoutNaNWarning,
 * TimeoutOverflowWarning) and use 1 ms.
 */
function timerTimeout(timeout: unknown): number {
  const ms = (timeout as number) | 0;
  return ms < 0 ? 0 : ms;
}

/**
 * https://html.spec.whatwg.org/#timer-initialisation-steps, delegated to `host` (the window's
 * current host global, so fake timers apply): returns 0 and schedules nothing once the window
 * is closed (jsdom), otherwise the host's handle, tracked so close() clears it.
 */
export function startTimer(
  window: Window,
  host: Record<string, unknown>,
  repeat: boolean,
  handler: unknown,
  timeout: unknown,
  args: unknown[],
): unknown {
  const ms = timerTimeout(timeout);
  if (window[$closed]) return 0;
  const start = host[repeat ? "setInterval" : "setTimeout"] as HostTimerFunction;
  const handle = args.length === 0 ? start(handler, ms) : start(handler, ms, ...args);
  trackTimer(window, handle, host[repeat ? "clearInterval" : "clearTimeout"] as ClearFunction);
  return handle;
}

function wrapTimer(window: Window, target: Record<string, unknown>, repeat: boolean): HostTimerFunction {
  const original = target[repeat ? "setInterval" : "setTimeout"] as HostTimerFunction;
  const clear = target[repeat ? "clearInterval" : "clearTimeout"] as ClearFunction;
  // Method syntax: named like the original, not a constructor.
  const wrapper = {
    setTimeout(handler: unknown, timeout?: unknown, ...args: unknown[]): unknown {
      const ms = timerTimeout(timeout);
      if (window[$closed]) return 0;
      const handle = args.length === 0 ? original(handler, ms) : original(handler, ms, ...args);
      trackTimer(window, handle, clear);
      return handle;
    },
    setInterval(handler: unknown, timeout?: unknown, ...args: unknown[]): unknown {
      const ms = timerTimeout(timeout);
      if (window[$closed]) return 0;
      const handle = args.length === 0 ? original(handler, ms) : original(handler, ms, ...args);
      trackTimer(window, handle, clear);
      return handle;
    },
  }[repeat ? "setInterval" : "setTimeout"];
  // Keep util.promisify.custom & co. (Node's timers carry symbol-keyed extras).
  for (const key of Object.getOwnPropertySymbols(original)) {
    Object.defineProperty(wrapper, key, Object.getOwnPropertyDescriptor(original, key)!);
  }
  return wrapper;
}

/**
 * Make the `setTimeout`/`setInterval` of `target` (the global `window` is installed on, e.g. a
 * Jest test file's vm global) window-owned: timers created through them are tracked on
 * `window` and cleared by `window.close()`, and once the window is closed they return 0 without
 * scheduling (like jsdom's per-window timers). The replacements are plain writable data
 * properties, so @sinonjs/fake-timers can install over them and restore them. Fake timers
 * installed on `target` are never tracked (they do not call through). Returns `restore()`.
 */
export function trackGlobalTimers(window: Window, target: Record<PropertyKey, unknown>): () => void {
  const saved: [string, PropertyDescriptor | undefined][] = [];
  for (const repeat of [false, true]) {
    const name = repeat ? "setInterval" : "setTimeout";
    if (typeof target[name] !== "function" || typeof target[repeat ? "clearInterval" : "clearTimeout"] !== "function")
      continue;
    saved.push([name, Object.getOwnPropertyDescriptor(target, name)]);
    Object.defineProperty(target, name, {
      value: wrapTimer(window, target, repeat),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return function restore(): void {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) delete target[name];
      else Object.defineProperty(target, name, descriptor);
    }
    saved.length = 0;
  };
}
