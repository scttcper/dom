/**
 * Animation frames, idle callbacks and window messaging, built on the host's timers.
 *
 * Spec:
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

describe("host delegates — https://html.spec.whatwg.org/#timers", () => {
  test("window.setTimeout is the current host setTimeout (fake timers included)", () => {
    const w = window as unknown as Record<string, unknown>;
    expect(w.setTimeout).toBe(globalThis.setTimeout);
    vi.useFakeTimers();
    expect(w.setTimeout).toBe(globalThis.setTimeout);
    expect(w.queueMicrotask).toBe(globalThis.queueMicrotask);
    expect(w.URL).toBe(URL);
  });
});
