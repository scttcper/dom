/**
 * Window operations called with the host global (or nothing) as `this`.
 *
 * Under the test environments the global code sees as `window` is the host global with the
 * window's members installed on it (installGlobals), not a Window instance. Code that takes a
 * Window.prototype method from one window and calls it on that global must still work, as it
 * does on jsdom where the global *is* the window. rrweb (Sentry Replay) does exactly this:
 * `sandboxIframe.contentWindow.requestAnimationFrame.bind(window)`.
 *
 * Spec: Web IDL §3.7.6 "Operations", create an operation function step 2.1 — a null/undefined
 *   `this` is the realm's global object, and on a global the global itself is a valid receiver:
 *   https://webidl.spec.whatwg.org/#dfn-create-operation-function
 *   HTML Standard — https://html.spec.whatwg.org/#dom-animationframeprovider-requestanimationframe
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWindow, installGlobals, type Window } from "@ctrl/dom";

type AnyFn = (...args: unknown[]) => unknown;

let cleanup: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanup.reverse()) fn();
  cleanup = [];
  vi.useRealTimers();
});

function installed(): { window: Window; global: Record<string, unknown> } {
  const window = createWindow();
  const global: Record<string, unknown> = { setTimeout, clearTimeout };
  const uninstall = installGlobals(window, global);
  cleanup.push(() => {
    window.close();
    uninstall();
  });
  return { window, global };
}

describe("operations on the host global — https://webidl.spec.whatwg.org/#dfn-create-operation-function", () => {
  test("an iframe's requestAnimationFrame bound to the page global schedules on the page window (rrweb getImplementation)", () => {
    vi.useFakeTimers();
    const { window, global } = installed();
    const sandbox = window.document.createElement("iframe");
    window.document.head!.appendChild(sandbox);
    const impl = (sandbox as unknown as { contentWindow: Record<string, AnyFn> }).contentWindow.requestAnimationFrame;
    window.document.head!.removeChild(sandbox);
    const raf = impl.bind(global);
    const spy = vi.fn();
    const id = raf(spy);
    expect(id).toBeGreaterThan(0);
    vi.advanceTimersByTime(16);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("Window.prototype methods accept the global they are installed on", () => {
    vi.useFakeTimers();
    const { window, global } = installed();
    const proto = Object.getPrototypeOf(window) as Record<string, AnyFn>;
    proto.scrollTo.call(global, 0, 40);
    expect(window.scrollY).toBe(40);
    expect((proto.matchMedia.call(global, "(min-width: 1px)") as { matches: boolean }).matches).toBe(true);
    const spy = vi.fn();
    proto.setTimeout.call(global, spy, 5);
    const id = proto.requestIdleCallback.call(global, spy);
    proto.cancelIdleCallback.call(global, id);
    vi.advanceTimersByTime(20);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("an unrelated receiver is an illegal invocation (TypeError)", () => {
    const window = createWindow();
    cleanup.push(() => window.close());
    const proto = Object.getPrototypeOf(window) as Record<string, AnyFn>;
    expect(() => proto.requestAnimationFrame.call({}, () => {})).toThrow(
      new TypeError("Failed to execute 'requestAnimationFrame' on 'Window': Illegal invocation"),
    );
  });

  test("after uninstall the old global is no longer a receiver", () => {
    const window = createWindow();
    const global: Record<string, unknown> = {};
    installGlobals(window, global)();
    cleanup.push(() => window.close());
    const proto = Object.getPrototypeOf(window) as Record<string, AnyFn>;
    expect(() => proto.cancelAnimationFrame.call(global, 1)).toThrow(TypeError);
  });
});
