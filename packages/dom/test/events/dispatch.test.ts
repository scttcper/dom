/**
 * The event dispatch algorithm.
 *
 * Spec: DOM Standard §2.9 "Dispatching events", §2.6 "Interface EventTarget" (get the parent)
 *   https://dom.spec.whatwg.org/#concept-event-dispatch
 *   https://dom.spec.whatwg.org/#concept-event-listener-invoke
 *   https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke
 *   https://dom.spec.whatwg.org/#get-the-parent
 *   https://dom.spec.whatwg.org/#dom-event-composedpath
 * HTML: https://html.spec.whatwg.org/#dom-window-event (window.event)
 *
 * Ported from WPT dom/events (links per test); original assertions kept. The WPT fixture
 * table is built with DOM calls (helpers.ts).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { CustomEvent, Event, EventTarget, MouseEvent, TransitionEvent, type Document, type Window } from "@rtd/dom";
import { dispatchTrusted, fireAnEvent, getCurrentEvent } from "@rtd/dom/internal";
import { buildTable, setup } from "./helpers.ts";

let window: Window;
let document: Document;

beforeEach(() => {
  ({ window, document } = setup());
});

const { CAPTURING_PHASE: C, AT_TARGET: A, BUBBLING_PHASE: B } = Event;

describe("event path and phases — https://dom.spec.whatwg.org/#concept-event-dispatch", () => {
  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-bubbles-true.html
  function testChain(target: EventTarget, targetParents: EventTarget[], phases: number[], type: string, bubbles = true) {
    const targets = [...targetParents, target];
    const expectedTargets = bubbles ? [...targets, ...targets.slice().reverse()] : [...targets, target];
    const actualTargets: unknown[] = [];
    const actualPhases: number[] = [];
    const listener = (evt: Event) => {
      actualTargets.push(evt.currentTarget);
      actualPhases.push(evt.eventPhase);
    };
    for (const t of targets) {
      t.addEventListener(type, listener, true);
      t.addEventListener(type, listener, false);
    }
    const evt = document.createEvent("Event");
    evt.initEvent(type, bubbles, true);
    target.dispatchEvent(evt);
    expect(actualTargets).toEqual(expectedTargets);
    expect(actualPhases).toEqual(phases);
  }

  const docPhases = [C, C, C, C, C, C, A, A, B, B, B, B, B, B];

  test("bubbling click in a window's document: window → document → ... → target → ... → window", () => {
    const t = buildTable(document);
    const chain = [window, document, t.html, t.body, t.table, t.tbody, t.parent];
    testChain(t.target, chain, [C, ...docPhases, B], "click");
  });

  test("Document get the parent: load events do not propagate to the window", () => {
    const t = buildTable(document);
    testChain(t.target, [document, t.html, t.body, t.table, t.tbody, t.parent], docPhases, "load");
  });

  test("documents without a browsing context end the path at the document", () => {
    const doc = document.implementation.createHTMLDocument("");
    const t = buildTable(doc);
    testChain(t.target, [doc, t.html, t.body, t.table, t.tbody, t.parent], docPhases, "click");
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-bubbles-false.html
  test("non-bubbling events skip the bubbling phase but still run at-target bubble listeners", () => {
    const t = buildTable(document);
    const chain = [window, document, t.html, t.body, t.table, t.tbody, t.parent];
    testChain(t.target, chain, [C, C, C, C, C, C, C, A, A], "click", false);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-order-at-target.html
  test("at target, capturing listeners run before bubbling ones regardless of registration order", () => {
    const el = document.createElement("div");
    let order: string[] = [];
    el.addEventListener("click", (e) => {
      expect(e.eventPhase).toBe(A);
      order.push("bubbling");
    });
    el.addEventListener(
      "click",
      (e) => {
        expect(e.eventPhase).toBe(A);
        order.push("capturing");
      },
      true,
    );
    el.dispatchEvent(new Event("click", { bubbles: true }));
    expect(order).toEqual(["capturing", "bubbling"]);
    order = [];
    el.dispatchEvent(new Event("click", { bubbles: false }));
    expect(order).toEqual(["capturing", "bubbling"]);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-dispatchEvent.html
  test("capturing listeners are called before non-capturing ones on the target", () => {
    const results: number[] = [];
    const b = document.createElement("b");
    b.addEventListener("x", () => results.push(1), true);
    b.addEventListener("x", () => results.push(2), false);
    b.addEventListener("x", () => results.push(3), true);
    b.dispatchEvent(new Event("x"));
    expect(results).toEqual([1, 3, 2]);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-omitted-capture.html
  test("omitting capture registers a bubbling listener", () => {
    const t = buildTable(document);
    const targets = [t.target, t.parent, t.tbody, t.table, t.body, t.html, document, window];
    const actualTargets: unknown[] = [];
    const actualPhases: number[] = [];
    const listener = (evt: Event) => {
      actualTargets.push(evt.currentTarget);
      actualPhases.push(evt.eventPhase);
    };
    for (const x of targets) x.addEventListener("foo", listener);
    const evt = document.createEvent("Event");
    evt.initEvent("foo", true, true);
    t.target.dispatchEvent(evt);
    for (const x of targets) x.removeEventListener("foo", listener);
    t.target.dispatchEvent(evt);
    expect(actualTargets).toEqual(targets);
    expect(actualPhases).toEqual([A, B, B, B, B, B, B, B]);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-target-moved.html
  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-target-removed.html
  test.each(["moved", "removed"])("the path is fixed before listeners run (target %s during dispatch)", (mode) => {
    const t = buildTable(document);
    const targets = [window, document, t.html, t.body, t.table, t.tbody, t.parent, t.target];
    const expectedTargets = [...targets, ...targets.slice().reverse()];
    const actualTargets: unknown[] = [];
    const actualPhases: number[] = [];
    const listener = (evt: Event) => {
      if (t.parent === t.target.parentNode) {
        if (mode === "moved") t.row.appendChild(t.parent.removeChild(t.target));
        else t.parent.removeChild(t.target);
      }
      actualTargets.push(evt.currentTarget);
      actualPhases.push(evt.eventPhase);
    };
    for (const x of targets) {
      x.addEventListener("foo", listener, true);
      x.addEventListener("foo", listener, false);
    }
    const evt = document.createEvent("Event");
    evt.initEvent("foo", true, true);
    t.target.dispatchEvent(evt);
    expect(actualTargets).toEqual(expectedTargets);
    expect(actualPhases).toEqual([C, C, C, C, C, C, C, A, A, B, B, B, B, B, B, B]);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-handlers-changed.html
  test("listener changes during dispatch: lists are cloned per invoke", () => {
    const t = buildTable(document);
    const targets = [window, document, t.html, t.body, t.table, t.tbody, t.parent, t.target];
    const expectedTargets = [window, document, t.html, t.body, t.table, t.tbody, t.parent, t.target, t.target, t.target, t.parent, t.tbody, t.table, t.body, t.html, document, window];
    const expectedListeners = [0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 1, 1, 1, 1, 1, 1];
    const actualTargets: unknown[] = [];
    const actualListeners: number[] = [];
    const flags = new Map<unknown, number>();
    const handlers: ((e: Event) => void)[] = [];
    const make = (i: number) => (evt: Event) => {
      actualTargets.push(evt.currentTarget);
      actualListeners.push(i);
      const ct = evt.currentTarget!;
      if (evt.eventPhase !== B && flags.get(ct) !== 1) {
        ct.removeEventListener("bar", handlers[0], true);
        ct.addEventListener("bar", handlers[2], true);
        flags.set(ct, 1);
      }
      if (evt.eventPhase !== C && flags.get(ct) !== 3) {
        ct.removeEventListener("bar", handlers[0], false);
        ct.addEventListener("bar", handlers[3], false);
        flags.set(ct, 3);
      }
    };
    for (let i = 0; i < 4; i++) handlers.push(make(i));
    for (const x of targets) {
      x.addEventListener("bar", handlers[0], true);
      x.addEventListener("bar", handlers[1], false);
    }
    const evt = document.createEvent("Event");
    evt.initEvent("bar", true, true);
    t.target.dispatchEvent(evt);
    expect(actualTargets).toEqual(expectedTargets);
    expect(actualListeners).toEqual(expectedListeners);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-dispatchEvent.html
  test("listeners added during dispatch to later path items are called", () => {
    const results: string[] = [];
    const outerb = document.createElement("b");
    const middleb = outerb.appendChild(document.createElement("b"));
    const innerb = middleb.appendChild(document.createElement("b"));
    outerb.addEventListener(
      "x",
      () => {
        middleb.addEventListener("x", () => results.push("middle"), true);
        results.push("outer");
      },
      true,
    );
    innerb.dispatchEvent(new Event("x"));
    expect(results).toEqual(["outer", "middle"]);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-reenter.html
  test("dispatching another event from a listener (re-entrancy)", () => {
    const t = buildTable(document);
    const targets = [window, document, t.html, t.body, t.table, t.tbody, t.parent, t.target];
    const expectedTargets = [window, document, t.html, t.body, t.table, t.target, t.parent, t.tbody, t.table, t.body, t.html, document, window, t.tbody, t.parent, t.target];
    const expectedTypes = ["foo", "foo", "foo", "foo", "foo", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "foo", "foo", "foo"];
    const actualTargets: unknown[] = [];
    const actualTypes: string[] = [];
    const listener = (evt: Event) => {
      actualTargets.push(evt.currentTarget);
      actualTypes.push(evt.type);
      if (t.table === evt.currentTarget && evt.type === "foo") {
        const e = document.createEvent("Event");
        e.initEvent("bar", true, true);
        t.target.dispatchEvent(e);
      }
    };
    for (const x of targets) {
      x.addEventListener("foo", listener, true);
      x.addEventListener("bar", listener, false);
    }
    const evt = document.createEvent("Event");
    evt.initEvent("foo", false, true);
    t.target.dispatchEvent(evt);
    expect(actualTargets).toEqual(expectedTargets);
    expect(actualTypes).toEqual(expectedTypes);
  });

  test("composedPath() during and after a re-entrant dispatch", () => {
    const outer = document.createElement("div");
    const inner = outer.appendChild(document.createElement("span"));
    let pathDuring: unknown[] = [];
    let pathAfterNested: unknown[] = [];
    const ev = new Event("a", { bubbles: true });
    inner.addEventListener("a", () => {
      pathDuring = ev.composedPath();
      outer.dispatchEvent(new Event("b"));
      pathAfterNested = ev.composedPath();
    });
    inner.dispatchEvent(ev);
    expect(pathDuring).toEqual([inner, outer]);
    expect(pathAfterNested).toEqual([inner, outer]);
    expect(ev.composedPath()).toEqual([]);
  });

  test("composedPath() includes document and window for connected targets", () => {
    const el = document.body!.appendChild(document.createElement("p"));
    let path: unknown[] = [];
    el.addEventListener("x", (e) => (path = e.composedPath()));
    el.dispatchEvent(new Event("x"));
    expect(path).toEqual([el, document.body, document.documentElement, document, window]);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-multiple-stopPropagation.html
describe("stopPropagation during dispatch — https://dom.spec.whatwg.org/#concept-event-listener-invoke", () => {
  test("invoke step 4: stopped propagation skips later path items; the flag resets per dispatch", () => {
    const t = buildTable(document);
    let actual: unknown[] = [];
    const listener = (evt: Event) => {
      actual.push(evt.currentTarget);
      if (t.parent === evt.currentTarget) evt.stopPropagation();
    };
    const evt = document.createEvent("Event");
    evt.initEvent("foo", true, true);
    for (const x of [t.target, t.parent, document, window]) x.addEventListener("foo", listener);
    t.target.dispatchEvent(evt);
    expect(actual).toEqual([t.target, t.parent]);
    actual = [];
    t.parent.dispatchEvent(evt);
    expect(actual).toEqual([t.parent]);
    actual = [];
    document.dispatchEvent(evt);
    expect(actual).toEqual([document, window]);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-propagation-stopped.html
  test("stopPropagation still runs the remaining listeners on the current target", () => {
    const t = buildTable(document);
    const calls: string[] = [];
    t.target.addEventListener("x", (e) => {
      calls.push("1");
      e.stopPropagation();
    });
    t.target.addEventListener("x", () => calls.push("2"));
    t.parent.addEventListener("x", () => calls.push("parent"));
    t.target.dispatchEvent(new Event("x", { bubbles: true }));
    expect(calls).toEqual(["1", "2"]);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-dispatchEvent.html
describe("dispatchEvent — https://dom.spec.whatwg.org/#dom-eventtarget-dispatchevent", () => {
  test("dispatchEvent(null) throws TypeError", () => {
    expect(() => document.dispatchEvent(null as never)).toThrow(TypeError);
  });

  test("step 1: dispatching an event that is being dispatched throws InvalidStateError", () => {
    const e = document.createEvent("Event");
    e.initEvent("type", false, false);
    const target = document.createElement("div");
    const errors: unknown[] = [];
    target.addEventListener("type", () => {
      for (const t of [target, document]) {
        try {
          t.dispatchEvent(e);
        } catch (err) {
          errors.push((err as DOMException).name);
        }
      }
    });
    expect(target.dispatchEvent(e)).toBe(true);
    expect(errors).toEqual(["InvalidStateError", "InvalidStateError"]);
  });

  test("exceptions from listeners are not propagated and later listeners still run", () => {
    window.addEventListener("error", (e) => e.preventDefault());
    const e = document.createEvent("Event");
    e.initEvent("type", false, false);
    const called: string[] = [];
    const target = document.createElement("div");
    target.addEventListener("type", () => {
      called.push("First");
      throw new Error();
    });
    target.addEventListener("type", () => called.push("Second"));
    expect(target.dispatchEvent(e)).toBe(true);
    expect(called).toEqual(["First", "Second"]);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-dispatchEvent-returnvalue.html
  test.each(["preventDefault", "returnValue"])("step 13: the return value reflects cancelation via %s", (how) => {
    const t = buildTable(document);
    let defaultPrevented: boolean | undefined;
    let returnValue: boolean | undefined;
    const evt = document.createEvent("Event");
    evt.initEvent("foo", true, true);
    t.parent.addEventListener("foo", () => {}, true);
    t.target.addEventListener(
      "foo",
      () => {
        if (how === "preventDefault") evt.preventDefault();
        else evt.returnValue = false;
        defaultPrevented = evt.defaultPrevented;
        returnValue = evt.returnValue;
      },
      true,
    );
    t.target.addEventListener("foo", () => {}, true);
    expect(t.parent.dispatchEvent(evt)).toBe(true);
    expect(t.target.dispatchEvent(evt)).toBe(false);
    expect(defaultPrevented).toBe(true);
    expect(returnValue).toBe(false);
  });

  test("step 2: dispatchEvent clears isTrusted", () => {
    const target = document.createElement("div");
    const ev = new Event("x");
    let trustedInside: boolean | null = null;
    target.addEventListener("x", (e) => (trustedInside = e.isTrusted));
    dispatchTrusted(ev, target);
    expect(trustedInside).toBe(true);
    target.dispatchEvent(ev);
    expect(trustedInside).toBe(false);
    expect(ev.isTrusted).toBe(false);
  });

  test("after dispatch: eventPhase NONE, currentTarget null, target kept", () => {
    const target = document.createElement("div");
    const ev = new Event("x");
    target.dispatchEvent(ev);
    expect(ev.eventPhase).toBe(Event.NONE);
    expect(ev.currentTarget).toBeNull();
    expect(ev.target).toBe(target);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-other-document.html
  test("dispatching on a node from another document works and does not reach this window", () => {
    const doc = document.implementation.createHTMLDocument("");
    const el = doc.createElement("div");
    doc.body!.appendChild(el);
    const calls: unknown[] = [];
    el.addEventListener("x", () => calls.push("el"));
    doc.addEventListener("x", () => calls.push("doc"));
    window.addEventListener("x", () => calls.push("window"));
    el.dispatchEvent(new Event("x", { bubbles: true }));
    expect(calls).toEqual(["el", "doc"]);
  });

  test("detached subtrees propagate up to their root only", () => {
    const root = document.createElement("div");
    const child = root.appendChild(document.createElement("span"));
    let path: unknown[] = [];
    child.addEventListener("x", (e) => (path = e.composedPath()));
    child.dispatchEvent(new Event("x", { bubbles: true }));
    expect(path).toEqual([child, root]);
  });
});

describe("legacy pre-fixed event types — https://dom.spec.whatwg.org/#concept-event-listener-invoke", () => {
  test("step 8: trusted unprefixed events with no listeners invoke webkit-prefixed listeners", () => {
    const el = document.createElement("div");
    const types: string[] = [];
    el.addEventListener("webkitTransitionEnd", (e) => types.push(e.type));
    fireAnEvent("transitionend", el, TransitionEvent);
    expect(types).toEqual(["webkitTransitionEnd"]);
    // Untrusted: no mapping.
    el.dispatchEvent(new TransitionEvent("transitionend"));
    expect(types).toEqual(["webkitTransitionEnd"]);
    // An unprefixed listener wins.
    el.addEventListener("transitionend", (e) => types.push(e.type));
    fireAnEvent("transitionend", el, TransitionEvent);
    expect(types).toEqual(["webkitTransitionEnd", "transitionend"]);
  });
});

describe("window.event — https://html.spec.whatwg.org/#dom-window-event", () => {
  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/event-global.html
  test("the current event is set while a listener runs and restored afterwards", () => {
    const el = document.createElement("div");
    const outer = new Event("outer");
    const inner = new CustomEvent("inner");
    const seen: unknown[] = [];
    el.addEventListener("outer", () => {
      seen.push(getCurrentEvent());
      el.dispatchEvent(inner);
      seen.push(getCurrentEvent());
    });
    el.addEventListener("inner", () => seen.push(getCurrentEvent()));
    expect(getCurrentEvent()).toBeUndefined();
    el.dispatchEvent(outer);
    expect(seen).toEqual([outer, inner, outer]);
    expect(getCurrentEvent()).toBeUndefined();
  });
});

describe("exception reporting — https://html.spec.whatwg.org/#report-an-exception", () => {
  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-throwing.html
  test("a throwing listener fires one ErrorEvent at the window; onerror receives the message string", () => {
    let errorEvents = 0;
    let messageType = "";
    (window as unknown as { onerror: unknown }).onerror = (e: unknown) => {
      messageType = typeof e;
      ++errorEvents;
      return true;
    };
    const element = document.createElement("div");
    let secondCalled = false;
    element.addEventListener("click", () => {
      throw new Error("Error from first listener");
    });
    element.addEventListener("click", () => (secondCalled = true));
    element.dispatchEvent(new Event("click"));
    expect(errorEvents).toBe(1);
    expect(messageType).toBe("string");
    expect(secondCalled).toBe(true);
  });

  test("the ErrorEvent carries message, error, filename and position", () => {
    const element = document.createElement("div");
    const error = new Error("kaboom");
    let ev: { message: string; error: unknown; filename: string; lineno: number; isTrusted: boolean; cancelable: boolean } | null = null;
    window.addEventListener("error", (e) => {
      ev = e as never;
      e.preventDefault();
    });
    element.addEventListener("x", () => {
      throw error;
    });
    element.dispatchEvent(new Event("x"));
    expect(ev!.message).toBe("kaboom");
    expect(ev!.error).toBe(error);
    expect(ev!.isTrusted).toBe(true);
    expect(ev!.cancelable).toBe(true);
    expect(ev!.filename).toContain("dispatch.test.ts");
    expect(ev!.lineno).toBeGreaterThan(0);
  });
});

describe("listener invocation does not depend on event subclass", () => {
  test("MouseEvent, CustomEvent and Event dispatched through the same listeners", () => {
    const el = document.createElement("div");
    const types: string[] = [];
    el.addEventListener("x", (e) => types.push(e.constructor.name));
    el.dispatchEvent(new MouseEvent("x"));
    el.dispatchEvent(new CustomEvent("x"));
    el.dispatchEvent(new Event("x"));
    expect(types).toEqual(["MouseEvent", "CustomEvent", "Event"]);
  });
});
