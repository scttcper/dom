// Window-owned host timers.
//
// https://html.spec.whatwg.org/#timers — "the map of active timers" belongs to the global, and
// closing a browsing context (https://html.spec.whatwg.org/#close-a-browsing-context) leaves no
// timer of that global able to run. jsdom implements exactly that: `window.close()` clears every
// pending timer and later setTimeout/setInterval calls return 0 without scheduling anything.
//
// @ctrl/dom's timers stay the *host's* (Node's, or a fake clock's): handles are Node Timeout
// objects and Vitest/Jest fake timers replace the global functions (docs/deviations.md). What
// we add is bookkeeping: a pending host timer owns its callback, while a window holds only a
// weak reference to it. This also works on fake hosts that return a handle object distinct from
// the timer they store. Fired or cancelled timers can release their arguments and async context
// before the window closes. Pending timers are cleared with the function of the host that armed them.

import type { Window } from "./Window.ts";
import { $closed, $timers } from "../keys.ts";

type ClearFunction = (handle: never) => void;
type HostTimerFunction = (handler: unknown, timeout?: unknown, ...args: unknown[]) => unknown;

let wrappedTimers: WeakMap<HostTimerFunction, Window> | undefined;

type TimerCallback = (this: unknown, ...args: unknown[]) => unknown;

interface PendingTimer extends TimerCallback {
  callback: TimerCallback | null;
  clear: ClearFunction | null;
  handle: unknown;
}

export class TimerList {
  readonly timers = new Set<WeakRef<PendingTimer>>();
  readonly collected = new FinalizationRegistry<WeakRef<PendingTimer>>((ref) => this.timers.delete(ref));
  /** Host extensions that accept a non-function handler have no callback to track weakly. */
  other: Map<unknown, ClearFunction> | null = null;
}

function pendingTimer(handler: TimerCallback, clear: ClearFunction): PendingTimer {
  const timer: PendingTimer = function (this: unknown, ...args: unknown[]): unknown {
    const callback = timer.callback;
    if (callback !== null) return Reflect.apply(callback, this, args);
  };
  timer.callback = handler;
  timer.clear = clear;
  timer.handle = undefined;
  return timer;
}

/** close(): clear every timer still pending on `window`. */
export function clearTimers(window: Window): void {
  const list = window[$timers];
  if (list === null) return;
  window[$timers] = null;
  for (const ref of list.timers) {
    const timer = ref.deref();
    if (timer === undefined) continue;
    timer.callback = null;
    clearHandle(timer.clear!, timer.handle);
    timer.clear = null;
    timer.handle = undefined;
  }
  list.timers.clear();
  if (list.other !== null) {
    for (const [handle, clear] of list.other) clearHandle(clear, handle);
    list.other.clear();
  }
}

function clearHandle(clear: ClearFunction, handle: unknown): void {
  try {
    clear(handle as never);
  } catch {
    // A fake clock that has since been uninstalled may refuse foreign handles.
  }
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
  const clear = host[repeat ? "clearInterval" : "clearTimeout"] as ClearFunction;
  return schedule(window, start, clear, handler, ms, args);
}

function schedule(
  window: Window,
  start: HostTimerFunction,
  clear: ClearFunction,
  handler: unknown,
  ms: number,
  args: unknown[],
): unknown {
  if (wrappedTimers?.get(start) === window) return start(handler, ms, ...args);
  if (typeof handler !== "function") {
    // Delegate validation to the host. Node throws here.
    const handle = start(handler, ms, ...args);
    if (window[$closed]) {
      clearHandle(clear, handle);
      return handle;
    }
    const list = (window[$timers] ??= new TimerList());
    (list.other ??= new Map()).set(handle, clear);
    return handle;
  }
  const timer = pendingTimer(handler as TimerCallback, clear);
  const handle = args.length === 0 ? start(timer, ms) : start(timer, ms, ...args);
  if (window[$closed]) {
    timer.callback = null;
    clearHandle(clear, handle);
    return handle;
  }
  timer.handle = handle;
  const list = (window[$timers] ??= new TimerList());
  const ref = new WeakRef(timer);
  list.timers.add(ref);
  list.collected.register(timer, ref);
  return handle;
}

function wrapTimer(window: Window, target: Record<string, unknown>, repeat: boolean): HostTimerFunction {
  const name = repeat ? "setInterval" : "setTimeout";
  const original = target[name] as HostTimerFunction;
  const clear = target[repeat ? "clearInterval" : "clearTimeout"] as ClearFunction;
  const wrapper = {
    [name](handler: unknown, timeout?: unknown, ...args: unknown[]): unknown {
      const ms = timerTimeout(timeout);
      return window[$closed] ? 0 : schedule(window, original, clear, handler, ms, args);
    },
  }[name];
  // Keep util.promisify.custom & co. (Node's timers carry symbol-keyed extras).
  for (const key of Object.getOwnPropertySymbols(original)) {
    Object.defineProperty(wrapper, key, Object.getOwnPropertyDescriptor(original, key)!);
  }
  (wrappedTimers ??= new WeakMap()).set(wrapper, window);
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
