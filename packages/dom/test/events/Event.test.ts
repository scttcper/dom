/**
 * The Event interface.
 *
 * Spec: DOM Standard §2.2 "Interface Event", §2.4 "Interface CustomEvent",
 *       §2.5 "Constructing events", §2.10 "Firing events" (createEvent)
 *   https://dom.spec.whatwg.org/#interface-event
 *   https://dom.spec.whatwg.org/#concept-event-initialize
 *   https://dom.spec.whatwg.org/#interface-customevent
 *   https://dom.spec.whatwg.org/#dom-document-createevent
 *
 * Ported from WPT dom/events (links per describe block); original assertions kept.
 */
import { beforeEach, describe, expect, test } from "vitest";
import {
  CompositionEvent,
  CustomEvent,
  DragEvent,
  Event,
  EventTarget,
  FocusEvent,
  HashChangeEvent,
  KeyboardEvent,
  MessageEvent,
  MouseEvent,
  StorageEvent,
  TouchEvent,
  UIEvent,
  type Document,
} from "@rtd/dom";
import { setup } from "./helpers.ts";

let document: Document;

beforeEach(() => {
  ({ document } = setup());
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-constructors.any.js
describe("Event constructor — https://dom.spec.whatwg.org/#dom-event-event", () => {
  test("calling Event without new throws TypeError", () => {
    expect(() => (Event as unknown as (t: string) => Event)("")).toThrow(TypeError);
    expect(() => (Event as unknown as (t: string) => Event)("test")).toThrow(TypeError);
  });

  test("the type argument is required", () => {
    expect(() => new (Event as unknown as new () => Event)()).toThrow(TypeError);
  });

  test("an exception thrown converting the type propagates unchanged", () => {
    const testError = { name: "test" };
    let caught: unknown;
    try {
      new Event({ toString: () => { throw testError; } } as unknown as string);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(testError);
  });

  test.each(["", "test"])("default attribute values (type %j)", (type) => {
    const ev = new Event(type);
    expect(ev.type).toBe(type);
    expect(ev.target).toBeNull();
    expect(ev.srcElement).toBeNull();
    expect(ev.currentTarget).toBeNull();
    expect(ev.eventPhase).toBe(Event.NONE);
    expect(ev.bubbles).toBe(false);
    expect(ev.cancelable).toBe(false);
    expect(ev.defaultPrevented).toBe(false);
    expect(ev.returnValue).toBe(true);
    expect(ev.isTrusted).toBe(false);
    expect(ev.timeStamp > 0).toBe(true);
    expect("initEvent" in ev).toBe(true);
  });

  test("init dictionary members are honored; unknown members ignored", () => {
    let ev = new Event("I am an event", { bubbles: true, cancelable: false });
    expect([ev.type, ev.bubbles, ev.cancelable]).toEqual(["I am an event", true, false]);
    ev = new Event("@", { bubblesIGNORED: true, cancelable: true } as never);
    expect([ev.bubbles, ev.cancelable]).toEqual([false, true]);
    ev = new Event("@", { "bubbles\0IGNORED": true, cancelable: true } as never);
    expect([ev.bubbles, ev.cancelable]).toEqual([false, true]);
    ev = new Event("Xx", { cancelable: true });
    expect([ev.bubbles, ev.cancelable]).toEqual([false, true]);
    ev = new Event("Xx", {});
    expect([ev.bubbles, ev.cancelable]).toEqual([false, false]);
    ev = new Event("Xx", { bubbles: true, cancelable: false, sweet: "x" } as never);
    expect((ev as unknown as { sweet: unknown }).sweet).toBeUndefined();
  });

  test("dictionary members are read in lexicographic order and only known members are read", () => {
    const called: string[] = [];
    const ev = new Event("Xx", {
      get cancelable() {
        called.push("cancelable");
        return false;
      },
      get bubbles() {
        called.push("bubbles");
        return true;
      },
      get sweet() {
        called.push("sweet");
        return "x";
      },
    } as never);
    expect(called).toEqual(["bubbles", "cancelable"]);
    expect(ev.bubbles).toBe(true);
    expect(ev.cancelable).toBe(false);
  });

  test("CustomEvent: detail and inherited members", () => {
    const ev = new CustomEvent("$", { detail: 54, sweet: "x", sweet2: "x", cancelable: true } as never);
    expect(ev.type).toBe("$");
    expect(ev.bubbles).toBe(false);
    expect(ev.cancelable).toBe(true);
    expect((ev as unknown as { sweet: unknown }).sweet).toBeUndefined();
    expect(ev.detail).toBe(54);
  });

  test("composed init member", () => {
    expect(new Event("x").composed).toBe(false);
    expect(new Event("x", { composed: true }).composed).toBe(true);
  });

  test("a non-object init dictionary throws TypeError", () => {
    expect(() => new Event("x", 5 as never)).toThrow(TypeError);
    expect(new Event("x", null).bubbles).toBe(false);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-constants.html
describe("Event constants — https://dom.spec.whatwg.org/#dom-event-none", () => {
  test("phase constants exist on the interface and on instances", () => {
    for (const obj of [Event, new Event("x")] as unknown as Record<string, number>[]) {
      expect(obj.NONE).toBe(0);
      expect(obj.CAPTURING_PHASE).toBe(1);
      expect(obj.AT_TARGET).toBe(2);
      expect(obj.BUBBLING_PHASE).toBe(3);
    }
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-returnValue.html
// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-defaultPrevented.html
describe("canceled flag — https://dom.spec.whatwg.org/#set-the-canceled-flag", () => {
  test("preventDefault() and returnValue=false do nothing when not cancelable", () => {
    const ev = new Event("foo", { cancelable: false });
    ev.preventDefault();
    expect(ev.returnValue).toBe(true);
    ev.returnValue = false;
    expect(ev.returnValue).toBe(true);
    expect(ev.defaultPrevented).toBe(false);
  });

  test("preventDefault() and returnValue=false set the canceled flag when cancelable", () => {
    let ev = new Event("foo", { cancelable: true });
    ev.preventDefault();
    expect(ev.returnValue).toBe(false);
    expect(ev.defaultPrevented).toBe(true);
    ev = new Event("foo", { cancelable: true });
    ev.returnValue = false;
    expect(ev.returnValue).toBe(false);
    expect(ev.defaultPrevented).toBe(true);
  });

  test("returnValue=true has no effect once the canceled flag was set", () => {
    const ev = new Event("foo", { cancelable: true });
    ev.preventDefault();
    ev.returnValue = true;
    expect(ev.defaultPrevented).toBe(true);
    expect(ev.returnValue).toBe(false);
  });

  test("initEvent unsets the canceled flag", () => {
    const ev = document.createEvent("Event");
    ev.returnValue = false;
    ev.initEvent("foo", true, true);
    expect(ev.bubbles).toBe(true);
    expect(ev.cancelable).toBe(true);
    expect(ev.returnValue).toBe(true);
  });

  test("defaultPrevented stays true after dispatch (Event-defaultPrevented-after-dispatch)", () => {
    const target = document.createElement("div");
    target.addEventListener("foo", (e) => e.preventDefault());
    const ev = new Event("foo", { cancelable: true });
    expect(target.dispatchEvent(ev)).toBe(false);
    expect(ev.defaultPrevented).toBe(true);
    // A second dispatch does not reset it.
    expect(target.dispatchEvent(ev)).toBe(false);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-cancelBubble.html
// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-propagation.html
describe("stop propagation flag — https://dom.spec.whatwg.org/#stop-propagation-flag", () => {
  test("cancelBubble is false on creation; stopPropagation/stopImmediatePropagation set it", () => {
    expect(document.createEvent("Event").cancelBubble).toBe(false);
    let e = document.createEvent("Event");
    e.stopPropagation();
    expect(e.cancelBubble).toBe(true);
    e = document.createEvent("Event");
    e.stopImmediatePropagation();
    expect(e.cancelBubble).toBe(true);
  });

  test("initEvent (re)initialization clears cancelBubble", () => {
    for (const bubbles of [true, false]) {
      const one = document.createEvent("Event");
      one.cancelBubble = true;
      one.initEvent("foo", bubbles, false);
      expect(one.cancelBubble).toBe(false);
      one.cancelBubble = true;
      one.initEvent("foo", bubbles, false);
      expect(one.cancelBubble).toBe(false);
    }
  });

  test("cancelBubble=false has no effect, also during propagation", () => {
    const one = document.createEvent("Event");
    one.stopPropagation();
    one.cancelBubble = false;
    expect(one.cancelBubble).toBe(true);

    const outer = document.createElement("div");
    const middle = outer.appendChild(document.createElement("div"));
    const inner = middle.appendChild(document.createElement("div"));
    let reached = false;
    outer.addEventListener("barbaz", () => (reached = true));
    middle.addEventListener("barbaz", (e) => {
      e.cancelBubble = true;
      e.cancelBubble = false;
    });
    const ev = document.createEvent("Event");
    ev.initEvent("barbaz", true, false);
    inner.dispatchEvent(ev);
    expect(reached).toBe(false);
  });

  test("dispatch step 10: the stop propagation flag is unset after dispatch", () => {
    const e = document.createEvent("Event");
    e.initEvent("foobar", true, true);
    document.body!.addEventListener("foobar", (ev) => ev.stopPropagation());
    document.body!.dispatchEvent(e);
    expect(e.cancelBubble).toBe(false);
  });

  test("cancelBubble=true stops bubbling and capturing", () => {
    const outer = document.createElement("div");
    const middle = outer.appendChild(document.createElement("div"));
    const inner = middle.appendChild(document.createElement("div"));
    const stopper = (e: Event) => (e.cancelBubble = true);
    let reached = 0;
    middle.addEventListener("bar", stopper);
    outer.addEventListener("bar", () => reached++);
    const bar = document.createEvent("Event");
    bar.initEvent("bar", true, false);
    inner.dispatchEvent(bar);
    outer.addEventListener("qux", stopper, true);
    middle.addEventListener("qux", () => reached++, true);
    const qux = document.createEvent("Event");
    qux.initEvent("qux", false, false);
    inner.dispatchEvent(qux);
    expect(reached).toBe(0);
  });

  test("propagation flags set before dispatch suppress listeners; dispatch then clears them", () => {
    const head = document.head!;
    function testPropagationFlag(ev: Event, expected: boolean) {
      let called = false;
      const callback = () => (called = true);
      head.addEventListener("foo", callback);
      head.dispatchEvent(ev);
      expect(called).toBe(expected);
      head.dispatchEvent(ev);
      expect(called).toBe(true);
      head.removeEventListener("foo", callback);
    }
    let ev = document.createEvent("Event");
    ev.initEvent("foo", true, false);
    testPropagationFlag(ev, true);
    ev.stopPropagation();
    testPropagationFlag(ev, false);
    ev.initEvent("foo", true, false);
    testPropagationFlag(ev, true);
    ev = document.createEvent("Event");
    ev.initEvent("foo", true, false);
    ev.stopImmediatePropagation();
    testPropagationFlag(ev, false);
    ev.initEvent("foo", true, false);
    testPropagationFlag(ev, true);
    ev = document.createEvent("Event");
    ev.initEvent("foo", true, false);
    ev.cancelBubble = true;
    testPropagationFlag(ev, false);
  });

  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-stopImmediatePropagation.html
  test("stopImmediatePropagation prevents later listeners on the same target", () => {
    const target = document.createElement("div");
    const calls: number[] = [];
    target.addEventListener("x", (e) => {
      calls.push(1);
      e.stopImmediatePropagation();
    });
    target.addEventListener("x", () => calls.push(2));
    target.dispatchEvent(new Event("x"));
    expect(calls).toEqual([1]);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-initEvent.html
describe("initEvent — https://dom.spec.whatwg.org/#dom-event-initevent", () => {
  for (const bubbles of [true, false]) {
    for (const cancelable of [true, false]) {
      test(`properties of initEvent(type, ${bubbles}, ${cancelable})`, () => {
        const e = document.createEvent("Event");
        e.initEvent("type", bubbles, cancelable);
        expect(e.defaultPrevented).toBe(false);
        expect(e.returnValue).toBe(true);
        expect(e.isTrusted).toBe(false);
        expect(e.target).toBeNull();
        expect(e.srcElement).toBeNull();
        expect(e.type).toBe("type");
        expect(e.bubbles).toBe(bubbles);
        expect(e.cancelable).toBe(cancelable);
      });
    }
  }

  test("calling initEvent multiple times", () => {
    const e = document.createEvent("Event");
    e.initEvent("type 1", true, false);
    expect([e.type, e.bubbles, e.cancelable]).toEqual(["type 1", true, false]);
    e.initEvent("type 2", false, true);
    expect([e.type, e.bubbles, e.cancelable]).toEqual(["type 2", false, true]);
  });

  test("step 1: initEvent has no effect during dispatch", () => {
    const e = document.createEvent("Event");
    e.initEvent("type", false, false);
    const target = document.createElement("div");
    let seen: unknown[] = [];
    target.addEventListener("type", () => {
      e.initEvent("fail", true, true);
      seen = [e.type, e.bubbles, e.cancelable];
    });
    expect(target.dispatchEvent(e)).toBe(true);
    expect(seen).toEqual(["type", false, false]);
  });

  test("initEvent unsets the stop propagation and stop immediate propagation flags", () => {
    for (const stop of ["stopPropagation", "stopImmediatePropagation"] as const) {
      const e = document.createEvent("Event");
      e[stop]();
      e.initEvent("type", false, false);
      const target = document.createElement("div");
      let called = false;
      target.addEventListener("type", () => (called = true));
      expect(e.cancelBubble).toBe(false);
      expect(target.dispatchEvent(e)).toBe(true);
      expect(called).toBe(true);
    }
  });

  test("the first parameter is mandatory; the others default to false", () => {
    const e = document.createEvent("Event");
    expect(() => (e.initEvent as () => void)()).toThrow(TypeError);
    e.initEvent("type");
    expect([e.type, e.bubbles, e.cancelable]).toEqual(["type", false, false]);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-dispatchEvent.html
describe("document.createEvent — https://dom.spec.whatwg.org/#dom-document-createevent", () => {
  const aliases: Record<string, unknown> = {
    BeforeUnloadEvent: "BeforeUnloadEvent",
    CompositionEvent,
    CustomEvent,
    DragEvent,
    Event,
    Events: Event,
    FocusEvent,
    HashChangeEvent,
    HTMLEvents: Event,
    KeyboardEvent,
    MessageEvent,
    MouseEvent,
    MouseEvents: MouseEvent,
    StorageEvent,
    SVGEvents: Event,
    TextEvent: "TextEvent",
    TouchEvent,
    UIEvent,
    UIEvents: UIEvent,
  };

  for (const [alias, iface] of Object.entries(aliases)) {
    test(`createEvent(${JSON.stringify(alias)}) creates an uninitialized ${typeof iface === "string" ? iface : (iface as { name: string }).name}`, () => {
      for (const name of [alias, alias.toLowerCase(), alias.toUpperCase()]) {
        const e = document.createEvent(name);
        if (typeof iface === "string") expect(Object.prototype.toString.call(e)).toBe(`[object ${iface}]`);
        else expect(e).toBeInstanceOf(iface as typeof Event);
        expect(e.type).toBe("");
        expect(e.isTrusted).toBe(false);
        // step 6: initialized flag unset → dispatchEvent throws InvalidStateError.
        expect(() => document.dispatchEvent(e)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      }
    });
  }

  test("unknown interfaces throw NotSupportedError", () => {
    for (const name of ["Foo", "WheelEvent", "PointerEvent", "InputEvent", "DeviceMotionEvent", "KeyEvents"]) {
      expect(() => document.createEvent(name), name).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    }
  });
});

describe("timeStamp — https://dom.spec.whatwg.org/#dom-event-timestamp", () => {
  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-timestamp-high-resolution.html
  test("timeStamp is a high-resolution time relative to the time origin", () => {
    const before = performance.now();
    const e = new Event("x");
    const after = performance.now();
    expect(e.timeStamp).toBeGreaterThanOrEqual(before);
    expect(e.timeStamp).toBeLessThanOrEqual(after);
  });
});

describe("Event-subclass toStringTag / prototype chain", () => {
  test("Object.prototype.toString reports the interface name", () => {
    expect(Object.prototype.toString.call(new Event("x"))).toBe("[object Event]");
    expect(Object.prototype.toString.call(new MouseEvent("x"))).toBe("[object MouseEvent]");
    expect(Object.prototype.toString.call(new EventTarget())).toBe("[object EventTarget]");
  });
});
