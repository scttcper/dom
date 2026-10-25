// The window's AbortSignal interface object: Node's AbortSignal (signals, `abort()`, `any()`,
// `instanceof`, AbortController all stay the host's), except that `AbortSignal.timeout()` runs on
// the window's timers like jsdom's (`globalObject.setTimeout`). Node's version uses an internal
// real-time timer, so Jest/Vitest fake timers and the virtual clock (window/clock.ts) never fire
// it: React Aria's runAfterKeyboard waits on `AbortSignal.timeout(600)` under fake timers.

import { currentWindowOrNull } from "./current.ts";

type HostAbortSignalConstructor = typeof globalThis.AbortSignal;

const HostAbortSignal: HostAbortSignalConstructor = globalThis.AbortSignal;
const HostAbortController = globalThis.AbortController;

// https://webidl.spec.whatwg.org/#abstract-opdef-converttoint ([EnforceRange] unsigned long long)
function enforceRange(value: unknown): number {
  const x = Number(value);
  if (!Number.isFinite(x))
    throw new TypeError("Failed to execute 'timeout' on 'AbortSignal': parameter 1 is not a finite number.");
  const n = Math.trunc(x);
  if (n < 0 || n > Number.MAX_SAFE_INTEGER)
    throw new TypeError("Failed to execute 'timeout' on 'AbortSignal': parameter 1 is outside the accepted range.");
  return n;
}

/** https://dom.spec.whatwg.org/#interface-AbortSignal — not constructible. */
export const AbortSignal = function AbortSignal(): never {
  throw new TypeError("Illegal constructor");
} as unknown as HostAbortSignalConstructor;

// Same prototype object, so `controller.signal instanceof AbortSignal` holds; statics other than
// timeout() (abort, any) are inherited from the host constructor.
Object.defineProperty(AbortSignal, "prototype", {
  value: HostAbortSignal.prototype,
  writable: false,
  enumerable: false,
  configurable: false,
});
Object.setPrototypeOf(AbortSignal, HostAbortSignal);

Object.defineProperty(AbortSignal, "timeout", {
  /** https://dom.spec.whatwg.org/#dom-abortsignal-timeout */
  value: function timeout(milliseconds: number): globalThis.AbortSignal {
    const ms = enforceRange(milliseconds);
    const window = currentWindowOrNull();
    if (window === null) return HostAbortSignal.timeout(ms);
    // 1. Let signal be a new AbortSignal object.
    const controller = new HostAbortController();
    // 3. Run steps after a timeout given global, "AbortSignal-timeout", milliseconds, and: queue a
    // global task to signal abort given signal and a new "TimeoutError" DOMException. The window's
    // setTimeout looks up the host's timer per call, so faked timers apply; close() clears it.
    window.setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
    return controller.signal;
  },
  writable: true,
  enumerable: true,
  configurable: true,
});
