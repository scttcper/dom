/**
 * Timers, animation frames, idle callbacks and window messaging, built on the host's timers.
 *
 * Spec:
 *   HTML Standard §8.6 "Timers" — https://html.spec.whatwg.org/#timers
 *     https://html.spec.whatwg.org/#timer-initialisation-steps
 *     https://html.spec.whatwg.org/#close-a-browsing-context
 *     (jsdom: lib/jsdom/browser/Window.js stopAllTimers / timerInitializationSteps)
 *   HTML Standard §8.10 "Animation frames"
 *     https://html.spec.whatwg.org/#animation-frames
 *     https://html.spec.whatwg.org/#run-the-animation-frame-callbacks
 *   Cooperative Scheduling of Background Tasks
 *     https://w3c.github.io/requestidlecallback/#the-requestidlecallback-method
 *   HTML Standard §9.3 "Cross-document messaging"
 *     https://html.spec.whatwg.org/#dom-window-postmessage
 *   HTML Standard §8.1.4.6 "Reporting exceptions"
 *     https://html.spec.whatwg.org/#dom-reporterror
 *
 * Implementation contract: every async step is scheduled through the *current* host
 * `setTimeout` (looked up at call time), so Vitest/Jest fake timers control it, and
 * `window.close()` cancels whatever is pending.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow, type Window } from "@rtd/dom";
import { $timers } from "@rtd/dom/internal";

let window: Window;

beforeEach(() => {
  window = createWindow();
});

afterEach(() => {
  window.close();
  vi.useRealTimers();
});

describe("requestAnimationFrame — https://html.spec.whatwg.org/#dom-animationframeprovider-requestanimationframe", () => {
  test("returns increasing non-zero handles", () => {
    const a = window.requestAnimationFrame(() => {});
    const b = window.requestAnimationFrame(() => {});
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  test("throws TypeError for a non-callable callback", () => {
    expect(() => window.requestAnimationFrame(null as never)).toThrow(TypeError);
  });

  test("callbacks run in one frame, in order, with the same timestamp (fake timers advance frames)", () => {
    vi.useFakeTimers();
    const calls: [string, number][] = [];
    window.requestAnimationFrame((t) => calls.push(["a", t]));
    window.requestAnimationFrame((t) => calls.push(["b", t]));
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(16);
    expect(calls.map((c) => c[0])).toEqual(["a", "b"]);
    expect(calls[0][1]).toBe(calls[1][1]);
    expect(typeof calls[0][1]).toBe("number");
  });

  test("callbacks requested during a frame run in the next frame", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    window.requestAnimationFrame(() => {
      calls.push("first");
      window.requestAnimationFrame(() => calls.push("second"));
    });
    vi.advanceTimersByTime(16);
    expect(calls).toEqual(["first"]);
    vi.advanceTimersByTime(16);
    expect(calls).toEqual(["first", "second"]);
  });

  test("cancelAnimationFrame removes a pending callback, also from within the same frame", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    let second = 0;
    const first = window.requestAnimationFrame(() => calls.push("cancelled"));
    window.requestAnimationFrame(() => {
      calls.push("canceller");
      window.cancelAnimationFrame(second);
    });
    second = window.requestAnimationFrame(() => calls.push("never"));
    window.cancelAnimationFrame(first);
    vi.runAllTimers();
    expect(calls).toEqual(["canceller"]);
  });

  test("a frame timer lost with an uninstalled fake clock does not wedge later frames", async () => {
    vi.useFakeTimers();
    const lost = vi.fn();
    window.requestAnimationFrame(lost); // scheduled on the fake clock...
    vi.useRealTimers(); // ...which is dropped with its pending timers
    const t = await new Promise<number>((resolve) => window.requestAnimationFrame(resolve));
    expect(t).toBeGreaterThan(0);
    // The callback requested before is part of the re-armed frame.
    expect(lost).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    const spy = vi.fn();
    window.requestAnimationFrame(spy);
    vi.runAllTimers();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("works with real timers", async () => {
    const t = await new Promise<number>((resolve) => window.requestAnimationFrame(resolve));
    expect(t).toBeGreaterThan(0);
  });

  test("close() cancels pending frames", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    window.requestAnimationFrame(spy);
    window.close();
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a throwing callback is reported and does not stop the frame", () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    window.addEventListener("error", (e) => {
      errors.push((e as unknown as { error: unknown }).error);
      e.preventDefault();
    });
    const boom = new Error("boom");
    const after = vi.fn();
    window.requestAnimationFrame(() => {
      throw boom;
    });
    window.requestAnimationFrame(after);
    vi.runAllTimers();
    expect(errors).toEqual([boom]);
    expect(after).toHaveBeenCalled();
  });
});

describe("requestIdleCallback — https://w3c.github.io/requestidlecallback/#the-requestidlecallback-method", () => {
  test("runs the callback with an IdleDeadline", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    window.requestIdleCallback(spy);
    vi.runAllTimers();
    expect(spy).toHaveBeenCalledTimes(1);
    const deadline = spy.mock.calls[0][0];
    expect(deadline.didTimeout).toBe(false);
    expect(deadline.timeRemaining()).toBeGreaterThanOrEqual(0);
  });

  test("cancelIdleCallback cancels", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const id = window.requestIdleCallback(spy);
    window.cancelIdleCallback(id);
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("postMessage — https://html.spec.whatwg.org/#dom-window-postmessage", () => {
  test("dispatches a MessageEvent asynchronously with a structured clone", () => {
    vi.useFakeTimers();
    const events: Record<string, unknown>[] = [];
    window.addEventListener("message", (e) => events.push(e as never));
    const data = { a: [1] };
    window.postMessage(data, "*");
    expect(events).toEqual([]);
    vi.runAllTimers();
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual(data);
    expect(events[0].data).not.toBe(data);
    expect(events[0].origin).toBe("http://localhost");
    expect(events[0].source).toBe(window);
  });

  test("a mismatched targetOrigin drops the message", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    window.addEventListener("message", spy);
    window.postMessage("x", "https://other.example");
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
  });

  test("an invalid targetOrigin throws SyntaxError", () => {
    expect(() => window.postMessage("x", "not a url")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });

  test("unserializable messages throw DataCloneError synchronously", () => {
    expect(() => window.postMessage(() => {}, "*")).toThrow(expect.objectContaining({ name: "DataCloneError" }));
  });
});

describe("setTimeout / setInterval — https://html.spec.whatwg.org/#timers", () => {
  test("delegate to the current host timers, so fake timers installed later control them", () => {
    const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
    vi.useFakeTimers();
    const spy = vi.fn();
    w.setTimeout(spy, 100, "a", "b");
    const tick = vi.fn();
    const id = w.setInterval(tick, 10);
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledWith("a", "b");
    expect(tick).toHaveBeenCalledTimes(10);
    w.clearInterval(id);
    vi.advanceTimersByTime(100);
    expect(tick).toHaveBeenCalledTimes(10);
  });

  test("handles are the host's (Node Timeout objects; deviation, docs/deviations.md)", () => {
    const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
    const handle = w.setTimeout(() => {}, 1000);
    expect(handle).toBeInstanceOf((setTimeout(() => {}, 0) as object).constructor);
    w.clearTimeout(handle);
    expect(w.clearTimeout).toBe(globalThis.clearTimeout);
    expect(w.queueMicrotask).toBe(globalThis.queueMicrotask);
    expect(w.URL).toBe(URL);
  });

  // https://html.spec.whatwg.org/#close-a-browsing-context — jsdom's window.close() clears the
  // map of active timers, and timer initialization on a closed window returns 0
  // (lib/jsdom/browser/Window.js timerInitializationSteps).
  test("close() clears pending timeouts and intervals (real timers)", async () => {
    const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
    let fired = 0;
    w.setTimeout(() => fired++, 5);
    w.setInterval(() => fired++, 5);
    window.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fired).toBe(0);
  });

  test("close() clears timers scheduled on a fake clock", () => {
    vi.useFakeTimers();
    const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
    const spy = vi.fn();
    w.setTimeout(spy, 5);
    w.setInterval(spy, 5);
    window.close();
    vi.advanceTimersByTime(100);
    expect(spy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a closed window's setTimeout/setInterval return 0 and schedule nothing", () => {
    vi.useFakeTimers();
    window.close();
    const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
    expect(w.setTimeout(() => {}, 1)).toBe(0);
    expect(w.setInterval(() => {}, 1)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("fired and cleared timers are not retained (swept once the list grows)", async () => {
    const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (let i = 0; i < 300; i++) w.setTimeout(() => {}, 0);
    for (let i = 0; i < 300; i++) w.clearTimeout(w.setTimeout(() => {}, 1000));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const pending = w.setTimeout(() => {}, 1000);
    for (let i = 0; i < 600; i++) w.setTimeout(() => {}, 0);
    const handles = (window as unknown as Record<symbol, { handles: Map<unknown, unknown> }>)[$timers].handles;
    expect(handles.has(pending)).toBe(true);
    expect(handles.size).toBeLessThanOrEqual(602);
    w.clearTimeout(pending);
  });

  // https://webidl.spec.whatwg.org/#dfn-create-operation-function step 2.1: an undefined `this`
  // is the realm's global — here the current window.
  test("called without a receiver (const { setTimeout } = window), it acts on the current window", () => {
    vi.useFakeTimers();
    const { setTimeout: st } = window as unknown as { setTimeout: (cb: () => void, ms: number) => unknown };
    const spy = vi.fn();
    st(spy, 1);
    window.close();
    vi.advanceTimersByTime(10);
    expect(spy).not.toHaveBeenCalled();
  });
});
