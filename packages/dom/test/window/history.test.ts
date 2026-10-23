/**
 * Session history.
 *
 * Spec: HTML Standard §7.2.3 "The History interface"
 *   https://html.spec.whatwg.org/#the-history-interface
 *   https://html.spec.whatwg.org/#shared-history-push/replace-state-steps
 *   https://html.spec.whatwg.org/#traverse-the-history-by-a-delta
 *   https://html.spec.whatwg.org/#update-document-for-history-step-application (popstate)
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow, type Window } from "@rtd/dom";

let window: Window;

beforeEach(() => {
  vi.useFakeTimers();
  window = createWindow({ url: "http://localhost:3000/start" });
});

afterEach(() => {
  window.close();
  vi.useRealTimers();
});

describe("pushState / replaceState — https://html.spec.whatwg.org/#shared-history-push/replace-state-steps", () => {
  test("initial history has one entry with null state", () => {
    expect(window.history.length).toBe(1);
    expect(window.history.state).toBeNull();
  });

  test("pushState adds an entry, updates the URL and stores a structured clone of the state", () => {
    const data = { page: 2, nested: { a: [1, 2] } };
    window.history.pushState(data, "", "/page/2?x=1");
    expect(window.history.length).toBe(2);
    expect(window.location.href).toBe("http://localhost:3000/page/2?x=1");
    expect(window.history.state).toEqual(data);
    expect(window.history.state).not.toBe(data);
  });

  test("pushState without a URL keeps the current URL", () => {
    window.history.pushState({ a: 1 }, "");
    expect(window.location.pathname).toBe("/start");
    expect(window.history.length).toBe(2);
  });

  test("replaceState replaces the current entry", () => {
    window.history.pushState(1, "", "/one");
    window.history.replaceState(2, "", "/two");
    expect(window.history.length).toBe(2);
    expect(window.history.state).toBe(2);
    expect(window.location.pathname).toBe("/two");
  });

  test("step 4: unserializable state throws DataCloneError", () => {
    expect(() => window.history.pushState({ fn() {} }, "")).toThrow(expect.objectContaining({ name: "DataCloneError" }));
  });

  test("step 6.3: cross-origin URLs throw SecurityError", () => {
    expect(() => window.history.pushState(null, "", "https://evil.example/")).toThrow(
      expect.objectContaining({ name: "SecurityError" }),
    );
  });

  test("pushState does not fire popstate or hashchange", () => {
    const spy = vi.fn();
    window.addEventListener("popstate", spy);
    window.addEventListener("hashchange", spy);
    window.history.pushState(null, "", "#frag");
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
  });

  test("pushing after going back truncates forward entries", () => {
    window.history.pushState(1, "", "/1");
    window.history.pushState(2, "", "/2");
    window.history.back();
    vi.runAllTimers();
    window.history.pushState(3, "", "/3");
    expect(window.history.length).toBe(3);
    window.history.forward();
    vi.runAllTimers();
    expect(window.location.pathname).toBe("/3");
  });
});

describe("traversal — https://html.spec.whatwg.org/#traverse-the-history-by-a-delta", () => {
  test("back() is asynchronous and fires popstate with the entry's state", () => {
    window.history.pushState({ n: 1 }, "", "/1");
    window.history.pushState({ n: 2 }, "", "/2");
    const states: unknown[] = [];
    window.addEventListener("popstate", (e) => states.push((e as unknown as { state: unknown }).state));
    window.history.back();
    expect(window.location.pathname).toBe("/2");
    vi.runAllTimers();
    expect(window.location.pathname).toBe("/1");
    expect(states).toEqual([{ n: 1 }]);
    expect(window.history.state).toEqual({ n: 1 });
  });

  test("go(-2) and forward() move by the delta", () => {
    window.history.pushState(1, "", "/1");
    window.history.pushState(2, "", "/2");
    window.history.go(-2);
    vi.runAllTimers();
    expect(window.location.pathname).toBe("/start");
    expect(window.history.state).toBeNull();
    window.history.forward();
    vi.runAllTimers();
    expect(window.location.pathname).toBe("/1");
  });

  test("out-of-range deltas do nothing", () => {
    const spy = vi.fn();
    window.addEventListener("popstate", spy);
    window.history.back();
    window.history.go(5);
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/start");
  });

  test("go(0) does not traverse", () => {
    const spy = vi.fn();
    window.addEventListener("popstate", spy);
    window.history.go(0);
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
  });

  test("traversing between entries that differ only in fragment fires popstate then hashchange", () => {
    window.history.pushState(null, "", "#a");
    const order: string[] = [];
    window.addEventListener("popstate", () => order.push("popstate"));
    window.addEventListener("hashchange", (e) => order.push(`hashchange ${(e as unknown as { newURL: string }).newURL}`));
    window.history.back();
    vi.runAllTimers();
    expect(order).toEqual(["popstate", "hashchange http://localhost:3000/start"]);
  });

  test("queued traversals are cancelled when the window closes", () => {
    window.history.pushState(1, "", "/1");
    window.history.back();
    window.close();
    vi.runAllTimers();
    expect(window.location.pathname).toBe("/1");
  });
});

describe("scrollRestoration — https://html.spec.whatwg.org/#dom-history-scroll-restoration", () => {
  test("accepts auto/manual and ignores other values", () => {
    expect(window.history.scrollRestoration).toBe("auto");
    window.history.scrollRestoration = "manual";
    expect(window.history.scrollRestoration).toBe("manual");
    window.history.scrollRestoration = "bogus";
    expect(window.history.scrollRestoration).toBe("manual");
  });
});
