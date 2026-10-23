/**
 * The window's AbortSignal interface object (packages/dom/src/window/abort.ts): the host's
 * AbortSignal, with `AbortSignal.timeout()` scheduled on the window's timers like jsdom's
 * (lib/jsdom/living/aborting/AbortSignal-impl.js `static timeout` → `globalObject.setTimeout`).
 *
 * Specs:
 *   DOM Standard §3.2 "Interface AbortSignal" — https://dom.spec.whatwg.org/#interface-AbortSignal
 *     https://dom.spec.whatwg.org/#dom-abortsignal-timeout
 *   HTML Standard — "run steps after a timeout": https://html.spec.whatwg.org/#run-steps-after-a-timeout
 *   Web IDL — [EnforceRange] unsigned long long: https://webidl.spec.whatwg.org/#abstract-opdef-converttoint
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow, type Window } from "@rtd/dom";

let window: Window;
let AbortSignalCtor: typeof AbortSignal;

beforeEach(() => {
  window = createWindow();
  AbortSignalCtor = (window as unknown as { AbortSignal: typeof AbortSignal }).AbortSignal;
});

afterEach(() => {
  window.close();
  vi.useRealTimers();
});

describe("AbortSignal.timeout() — https://dom.spec.whatwg.org/#dom-abortsignal-timeout", () => {
  test("step 3: the timeout runs on the window's (faked) timers, then signals abort with a TimeoutError DOMException", () => {
    vi.useFakeTimers();
    const signal = AbortSignalCtor.timeout(600);
    const onAbort = vi.fn();
    signal.addEventListener("abort", onAbort);
    vi.advanceTimersByTime(599);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(signal.reason).toBeInstanceOf(DOMException);
    expect((signal.reason as DOMException).name).toBe("TimeoutError");
    expect(() => signal.throwIfAborted()).toThrow("The operation timed out.");
  });

  test("window.close() clears the pending timeout (the window owns the timer)", () => {
    vi.useFakeTimers();
    const signal = AbortSignalCtor.timeout(10);
    window.close();
    vi.advanceTimersByTime(100);
    expect(signal.aborted).toBe(false);
  });

  test("milliseconds is [EnforceRange] unsigned long long: non-finite or negative values throw TypeError", () => {
    expect(() => AbortSignalCtor.timeout(Number.NaN)).toThrow(TypeError);
    expect(() => AbortSignalCtor.timeout(Infinity)).toThrow(TypeError);
    expect(() => AbortSignalCtor.timeout(-1)).toThrow(TypeError);
  });
});

describe("interface object — https://dom.spec.whatwg.org/#interface-AbortSignal", () => {
  test("signals from the host's AbortController, abort() and any() are instances", () => {
    expect(new AbortController().signal).toBeInstanceOf(AbortSignalCtor);
    const aborted = AbortSignalCtor.abort("why");
    expect(aborted).toBeInstanceOf(AbortSignalCtor);
    expect(aborted.reason).toBe("why");
    expect(AbortSignalCtor.any([aborted]).aborted).toBe(true);
    expect(AbortSignalCtor.prototype).toBe(AbortSignal.prototype);
  });

  test("has no constructor: new AbortSignal() throws TypeError", () => {
    expect(() => new (AbortSignalCtor as unknown as new () => unknown)()).toThrow(TypeError);
  });
});
