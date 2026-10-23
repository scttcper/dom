/**
 * Installing a Window as the host global, and restoring the host afterwards.
 *
 * Spec: HTML Standard §7.2 "The Window object"
 *   https://html.spec.whatwg.org/#the-window-object
 *   https://html.spec.whatwg.org/#dom-window (window/self/frames), #dom-parent, #dom-top
 *   https://webidl.spec.whatwg.org/#es-interfaces (interface objects on the global)
 *   https://html.spec.whatwg.org/#dom-document-defaultview
 *
 * Contract (src/window/globals.ts): the host global becomes the window; DOM interface objects
 * replace Node's DOM-ish globals while installed; Node's timers/URL/fetch/DOMException stay;
 * uninstall() restores every replaced descriptor without invoking Node's lazy getters.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWindow, currentWindowOrNull, installGlobals, EventTarget as RtdEventTarget, Node as RtdNode, FormData as RtdFormData, type Window } from "@rtd/dom";

type G = Record<string, unknown>;

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
});

function installOn(target: G = {}, window: Window = createWindow()): { target: G; window: Window; uninstall: () => void } {
  const uninstall = installGlobals(window, target);
  cleanup = () => {
    uninstall();
    window.close();
  };
  return { target, window, uninstall };
}

describe("WindowProxy self references — https://html.spec.whatwg.org/#dom-window", () => {
  test("window, self, frames, parent and top are the host global", () => {
    const { target } = installOn();
    for (const key of ["window", "self", "frames", "parent", "top"]) expect(target[key]).toBe(target);
  });

  test("document is the window's document and defaultView is the host global", () => {
    const { target, window } = installOn();
    expect(target.document).toBe(window.document);
    expect(window.document.defaultView).toBe(target);
  });
});

describe("events at the window expose the WindowProxy — https://dom.spec.whatwg.org/#concept-event-dispatch", () => {
  type Listen = (type: string, fn: (this: unknown, e: Event) => void, capture?: boolean) => void;

  test("an event dispatched at the window has the host global as target, currentTarget, this and composedPath()", () => {
    const { target } = installOn();
    const seen: unknown[][] = [];
    (target.addEventListener as Listen)("focus", function (this: unknown, e: Event) {
      seen.push([e.target, e.currentTarget, this, e.composedPath()]);
    });
    (target.dispatchEvent as (e: Event) => boolean)(new (target.Event as typeof Event)("focus"));
    expect(seen).toEqual([[target, target, target, [target]]]);
  });

  test("an event bubbling from the document reaches the window with currentTarget/this as the host global", () => {
    const { target, window } = installOn();
    const seen: unknown[][] = [];
    (target.addEventListener as Listen)(
      "click",
      function (this: unknown, e: Event) {
        seen.push([e.target, e.currentTarget, this, e.composedPath().at(-1)]);
      },
      true,
    );
    window.document.body.dispatchEvent(new (target.Event as typeof Event)("click", { bubbles: true }));
    expect(seen).toEqual([[window.document.body, target, target, target]]);
  });

  test("once listeners and on* handlers still work on the window", () => {
    const { target } = installOn();
    const calls: unknown[] = [];
    (target.addEventListener as (type: string, fn: () => void, o: object) => void)("resize", () => calls.push("once"), { once: true });
    target.onresize = function (this: unknown) {
      calls.push(this === target ? "handler" : "handler (wrong this)");
    };
    const fire = () => (target.dispatchEvent as (e: Event) => boolean)(new (target.Event as typeof Event)("resize"));
    fire();
    fire();
    expect(calls).toEqual(["once", "handler", "handler"]);
  });

  test("without installGlobals the Window itself is the target", () => {
    const window = createWindow();
    let got: unknown = null;
    window.addEventListener("focus", (e) => (got = e.target));
    window.dispatchEvent(new (window as unknown as { Event: typeof Event }).Event("focus"));
    expect(got).toBe(window);
    window.close();
  });
});

describe("interface objects — https://webidl.spec.whatwg.org/#es-interfaces", () => {
  test("DOM interfaces are installed as non-enumerable data properties", () => {
    const { target } = installOn();
    expect(target.Node).toBe(RtdNode);
    expect(target.EventTarget).toBe(RtdEventTarget);
    for (const name of ["Element", "HTMLElement", "Document", "Text", "Event", "CustomEvent", "Storage", "Location", "History", "MediaQueryList", "DOMRect", "IntersectionObserver", "FileReader", "FileList", "DOMParser", "XMLSerializer", "MessageEvent"]) {
      expect(typeof target[name], name).toBe("function");
    }
    // Not exposed, like jsdom: libraries feature-detect it (docs/deviations.md).
    expect("ResizeObserver" in target).toBe(false);
    const d = Object.getOwnPropertyDescriptor(target, "Node")!;
    expect(d.enumerable).toBe(false);
    expect(d.writable).toBe(true);
  });

  test("namespace and legacy callback interface objects are exposed (https://webidl.spec.whatwg.org/#legacy-callback-interface-object)", () => {
    const { target } = installOn();
    const NodeFilter = target.NodeFilter as Record<string, number>;
    expect(NodeFilter.SHOW_TEXT).toBe(4);
    expect(NodeFilter.FILTER_ACCEPT).toBe(1);
    expect(typeof (target.CSS as { escape: unknown }).escape).toBe("function");
    expect((createWindow() as unknown as G).NodeFilter).toBe(NodeFilter);
  });

  test("interface objects are shared module-level classes on every window", () => {
    const a = createWindow() as unknown as G;
    const b = createWindow() as unknown as G;
    expect(a.HTMLElement).toBe(b.HTMLElement);
    expect(a.Node).toBe(RtdNode);
  });
});

describe("installing on globalThis", () => {
  test("replaces Node's DOM-ish globals and restores them, keeping Node's platform APIs", () => {
    const g = globalThis as unknown as G;
    const before = {
      Event: Object.getOwnPropertyDescriptor(g, "Event"),
      EventTarget: Object.getOwnPropertyDescriptor(g, "EventTarget"),
      navigator: Object.getOwnPropertyDescriptor(g, "navigator"),
      localStorage: Object.getOwnPropertyDescriptor(g, "localStorage"),
      DOMException: g.DOMException,
      setTimeout: g.setTimeout,
      URL: g.URL,
      fetch: g.fetch,
      Blob: g.Blob,
      FormData: g.FormData,
    };
    expect(g.window).toBeUndefined();
    const window = createWindow();
    const uninstall = installGlobals(window, g);
    try {
      expect(g.window).toBe(g);
      expect(g.document).toBe(window.document);
      expect(g.EventTarget).toBe(RtdEventTarget);
      expect(g.navigator).toBe(window.navigator);
      expect(g.localStorage).toBe(window.localStorage);
      expect(g.FormData).toBe(RtdFormData);
      expect(g.FormData).not.toBe(before.FormData);
      expect(g.DOMException).toBe(before.DOMException);
      expect(g.setTimeout).toBe(before.setTimeout);
      expect(g.URL).toBe(before.URL);
      expect(g.fetch).toBe(before.fetch);
      expect(g.Blob).toBe(before.Blob);
      expect(currentWindowOrNull()).toBe(window);
    } finally {
      uninstall();
      window.close();
    }
    expect(g.window).toBeUndefined();
    expect(g.document).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(g, "Event")).toEqual(before.Event);
    expect(Object.getOwnPropertyDescriptor(g, "EventTarget")).toEqual(before.EventTarget);
    expect(Object.getOwnPropertyDescriptor(g, "navigator")).toEqual(before.navigator);
    expect(Object.getOwnPropertyDescriptor(g, "localStorage")).toEqual(before.localStorage);
    expect(g.FormData).toBe(before.FormData);
  });

  test("uninstall is idempotent and restores the previously current window", () => {
    const first = createWindow();
    const second = createWindow();
    expect(currentWindowOrNull()).toBe(second);
    const { uninstall } = installOn({}, first);
    expect(currentWindowOrNull()).toBe(first);
    uninstall();
    uninstall();
    expect(currentWindowOrNull()).toBe(second);
  });
});

describe("methods — https://html.spec.whatwg.org/#the-window-object", () => {
  test("methods are bound to the window", () => {
    const { target, window } = installOn();
    const spy = vi.fn();
    (target.addEventListener as (t: string, l: () => void) => void)("custom", spy);
    window.dispatchEvent(new (target.Event as new (t: string) => never)("custom"));
    expect(spy).toHaveBeenCalledTimes(1);
    const mql = (target.matchMedia as (q: string) => { matches: boolean })("(min-width: 1px)");
    expect(mql.matches).toBe(true);
  });

  test("requestAnimationFrame is a plain data property; faking setTimeout drives it", () => {
    const g = globalThis as unknown as G;
    const window = createWindow();
    const uninstall = installGlobals(window, g);
    try {
      const installed = g.requestAnimationFrame;
      const d = Object.getOwnPropertyDescriptor(g, "requestAnimationFrame")!;
      expect(d.writable).toBe(true);
      expect(d.configurable).toBe(true);
      // What @sinonjs/fake-timers does: assign a replacement, later assign the original back.
      const fake = () => 0;
      g.requestAnimationFrame = fake;
      expect(g.requestAnimationFrame).toBe(fake);
      g.requestAnimationFrame = installed;
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const spy = vi.fn();
      (g.requestAnimationFrame as (cb: () => void) => number)(spy);
      vi.advanceTimersByTime(15);
      expect(spy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      uninstall();
      window.close();
    }
  });
});

describe("attributes — https://drafts.csswg.org/cssom-view/#extensions-to-the-window-interface", () => {
  test("innerWidth assignments reach the window (and matchMedia)", () => {
    const { target, window } = installOn();
    target.innerWidth = 500;
    expect(window.innerWidth).toBe(500);
    expect((target.matchMedia as (q: string) => { matches: boolean })("(max-width: 600px)").matches).toBe(true);
  });

  test("read-only attributes are replaceable on the global", () => {
    const { target, window } = installOn();
    target.outerWidth = 1;
    expect(target.outerWidth).toBe(1);
    expect(window.outerWidth).toBe(1024);
  });

  test("location assignment navigates", () => {
    const { target, window } = installOn();
    target.location = "/next";
    expect(window.location.pathname).toBe("/next");
  });

  test("event handler attributes forward", () => {
    const { target, window } = installOn();
    const handler = vi.fn();
    target.onresize = handler;
    expect((window as unknown as G).onresize).toBe(handler);
    window.resizeTo(10, 10);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("window.event is undefined outside dispatch", () => {
    const { target } = installOn();
    expect("event" in target).toBe(true);
    expect(target.event).toBeUndefined();
  });
});

describe("window creation cost", () => {
  test("creating a window allocates no per-window interface objects", () => {
    const a = createWindow() as unknown as G;
    expect(Object.hasOwn(a, "HTMLElement")).toBe(false);
    expect(Object.hasOwn(a, "location")).toBe(false);
  });
});
