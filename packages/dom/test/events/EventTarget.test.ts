/**
 * EventTarget: adding/removing listeners and listener options.
 *
 * Spec: DOM Standard §2.7 "Interface EventTarget"
 *   https://dom.spec.whatwg.org/#interface-eventtarget
 *   https://dom.spec.whatwg.org/#add-an-event-listener
 *   https://dom.spec.whatwg.org/#remove-an-event-listener
 *   https://dom.spec.whatwg.org/#concept-flatten-options
 *   https://dom.spec.whatwg.org/#default-passive-value
 *   https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke
 *
 * Mostly ported from WPT dom/events (links per describe block); original assertions kept.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { CustomEvent, Event, EventTarget, type Document, type Window } from "@rtd/dom";
import { setup } from "./helpers.ts";
import { $listeners } from "../../src/keys.ts";

let window: Window;
let document: Document;

beforeEach(() => {
  ({ window, document } = setup());
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-constructible.any.js
describe("EventTarget constructor — https://dom.spec.whatwg.org/#dom-eventtarget-eventtarget", () => {
  test("a constructed EventTarget can be used as expected", () => {
    const target = new EventTarget();
    const event = new Event("foo", { bubbles: true, cancelable: false });
    let callCount = 0;
    function listener(e: Event) {
      expect(e).toBe(event);
      ++callCount;
    }
    target.addEventListener("foo", listener);
    target.dispatchEvent(event);
    expect(callCount).toBe(1);
    target.dispatchEvent(event);
    expect(callCount).toBe(2);
    target.removeEventListener("foo", listener);
    target.dispatchEvent(event);
    expect(callCount).toBe(2);
  });

  test("a constructed EventTarget implements dispatch correctly (target, currentTarget, composedPath)", () => {
    const target = new EventTarget();
    const event = new Event("foo");
    function listener(e: Event) {
      expect(e).toBe(event);
      expect(e.target).toBe(target);
      expect(e.currentTarget).toBe(target);
      expect(e.composedPath()).toEqual([target]);
    }
    target.addEventListener("foo", listener, { once: true });
    target.dispatchEvent(event);
    expect(event.target).toBe(target);
    expect(event.currentTarget).toBeNull();
    expect(event.composedPath()).toEqual([]);
  });

  test("EventTarget can be subclassed", () => {
    class NicerEventTarget extends EventTarget {
      on(type: string, fn: (e: Event) => void) {
        this.addEventListener(type, fn);
      }
      off(type: string, fn: (e: Event) => void) {
        this.removeEventListener(type, fn);
      }
      dispatch(type: string, detail: unknown) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
      }
    }
    const target = new NicerEventTarget();
    const detail = "some data";
    let callCount = 0;
    function listener(e: Event) {
      expect((e as CustomEvent).detail).toBe(detail);
      ++callCount;
    }
    target.on("foo", listener);
    target.dispatch("foo", detail);
    expect(callCount).toBe(1);
    target.dispatch("foo", detail);
    expect(callCount).toBe(2);
    target.off("foo", listener);
    target.dispatch("foo", detail);
    expect(callCount).toBe(2);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-addEventListener.any.js
// https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-removeEventListener.any.js
// https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventTarget-add-remove-listener.any.js
describe("addEventListener / removeEventListener — https://dom.spec.whatwg.org/#dom-eventtarget-addeventlistener", () => {
  test("add step 3: a null callback is ignored and returns undefined", () => {
    const et = new EventTarget();
    expect(et.addEventListener("x", null, false)).toBeUndefined();
    expect(et.addEventListener("x", null, true)).toBeUndefined();
    expect(et.addEventListener("x", null)).toBeUndefined();
    expect(et[$listeners] ?? null).toBeNull();
  });

  test("removing a null event listener succeeds", () => {
    expect(window.removeEventListener("x", null, false)).toBeUndefined();
    expect(window.removeEventListener("x", null, true)).toBeUndefined();
    expect(window.removeEventListener("x", null)).toBeUndefined();
  });

  test("removing an event listener without explicit capture arg succeeds", () => {
    function listener(evt: Event) {
      evt.preventDefault();
      return false;
    }
    const et = new EventTarget();
    et.addEventListener("x", listener, false);
    expect(et.dispatchEvent(new Event("x", { cancelable: true }))).toBe(false);
    et.removeEventListener("x", listener);
    expect(et.dispatchEvent(new Event("x", { cancelable: true }))).toBe(true);
  });

  test("add step 5: the same (type, callback, capture) is only added once", () => {
    const et = new EventTarget();
    let count = 0;
    const fn = () => count++;
    et.addEventListener("x", fn);
    et.addEventListener("x", fn);
    et.addEventListener("x", fn, { passive: true, once: true });
    et.dispatchEvent(new Event("x"));
    expect(count).toBe(1);
    et.addEventListener("x", fn, true);
    et.dispatchEvent(new Event("x"));
    expect(count).toBe(3);
  });

  test("a non-object, non-null callback throws TypeError", () => {
    const et = new EventTarget();
    expect(() => et.addEventListener("x", 42 as never)).toThrow(TypeError);
    expect(() => et.removeEventListener("x", "nope" as never)).toThrow(TypeError);
  });

  test("addEventListener requires two arguments", () => {
    const et = new EventTarget();
    expect(() => (et.addEventListener as (t: string) => void)("x")).toThrow(TypeError);
  });

  test("the listener map stays absent until the first listener (zero-cost fast path); removed listeners never run", () => {
    const et = document.createElement("div");
    expect(et[$listeners] ?? null).toBeNull();
    let count = 0;
    const fn = () => count++;
    et.addEventListener("a", fn);
    et.addEventListener("b", fn, true);
    expect(et[$listeners] ?? null).not.toBeNull();
    et.removeEventListener("a", fn);
    et.removeEventListener("b", fn, true);
    et.dispatchEvent(new Event("a"));
    et.dispatchEvent(new Event("b"));
    expect(count).toBe(0);
  });

  test("the event type is converted to a string", () => {
    const et = new EventTarget();
    let called = false;
    et.addEventListener(1 as unknown as string, () => (called = true));
    et.dispatchEvent(new Event("1"));
    expect(called).toBe(true);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventListenerOptions-capture.html
describe("capture option — https://dom.spec.whatwg.org/#concept-flatten-options", () => {
  function testCaptureValue(captureValue: unknown, expectedValue: number) {
    let handlerPhase: number | undefined;
    const handler = (e: Event) => {
      expect(handlerPhase).toBeUndefined();
      handlerPhase = e.eventPhase;
    };
    document.addEventListener("test", handler, captureValue as boolean);
    document.body!.dispatchEvent(new Event("test", { bubbles: true }));
    document.removeEventListener("test", handler, captureValue as boolean);
    document.body!.dispatchEvent(new Event("test", { bubbles: true }));
    expect(handlerPhase, `capture value ${JSON.stringify(captureValue)}`).toBe(expectedValue);
  }

  test("capture boolean is honored", () => {
    testCaptureValue(true, Event.CAPTURING_PHASE);
    testCaptureValue(false, Event.BUBBLING_PHASE);
    testCaptureValue(null, Event.BUBBLING_PHASE);
    testCaptureValue(undefined, Event.BUBBLING_PHASE);
    testCaptureValue(2.3, Event.CAPTURING_PHASE);
    testCaptureValue(-1000.3, Event.CAPTURING_PHASE);
    testCaptureValue(NaN, Event.BUBBLING_PHASE);
    testCaptureValue(+0.0, Event.BUBBLING_PHASE);
    testCaptureValue(-0.0, Event.BUBBLING_PHASE);
    testCaptureValue("", Event.BUBBLING_PHASE);
    testCaptureValue("AAAA", Event.CAPTURING_PHASE);
  });

  test("capture option is honored", () => {
    testCaptureValue({}, Event.BUBBLING_PHASE);
    testCaptureValue({ capture: true }, Event.CAPTURING_PHASE);
    testCaptureValue({ capture: false }, Event.BUBBLING_PHASE);
    testCaptureValue({ capture: 2 }, Event.CAPTURING_PHASE);
    testCaptureValue({ capture: 0 }, Event.BUBBLING_PHASE);
  });

  test("both addEventListener and removeEventListener read the capture option", () => {
    let supportsCapture = false;
    const options = {
      get capture() {
        supportsCapture = true;
        return false;
      },
      get dummy() {
        throw new Error("dummy value getter invoked");
      },
    };
    document.addEventListener("test_event", null, options);
    expect(supportsCapture).toBe(true);
    supportsCapture = false;
    document.removeEventListener("test_event", null, options);
    expect(supportsCapture).toBe(true);
  });

  test("equivalence of option values between add and remove", () => {
    function testOptionEquality(addOptionValue: unknown, removeOptionValue: unknown, expectedEquality: boolean) {
      let handlerInvoked = false;
      const handler = () => {
        expect(handlerInvoked).toBe(false);
        handlerInvoked = true;
      };
      document.addEventListener("test", handler, addOptionValue as boolean);
      document.removeEventListener("test", handler, removeOptionValue as boolean);
      document.body!.dispatchEvent(new Event("test", { bubbles: true }));
      expect(!handlerInvoked).toBe(expectedEquality);
      if (handlerInvoked) document.removeEventListener("test", handler, addOptionValue as boolean);
    }
    testOptionEquality({}, false, true);
    testOptionEquality({ capture: false }, false, true);
    testOptionEquality(true, { capture: true }, true);
    testOptionEquality({ capture: null }, undefined, true);
    testOptionEquality({ capture: true }, { dummy: false, capture: 1 }, true);
    testOptionEquality({ dummy: true }, false, true);
    testOptionEquality(true, false, false);
    testOptionEquality(true, { capture: false }, false);
    testOptionEquality({}, true, false);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/AddEventListenerOptions-once.any.js
describe("once option — https://dom.spec.whatwg.org/#dom-addeventlisteneroptions-once", () => {
  test("a once listener is invoked only once", () => {
    let invokedOnce = false;
    let invokedNormal = false;
    const handlerOnce = () => (invokedOnce = true);
    const handlerNormal = () => (invokedNormal = true);
    const et = new EventTarget();
    et.addEventListener("test", handlerOnce, { once: true });
    et.addEventListener("test", handlerNormal);
    et.dispatchEvent(new Event("test"));
    expect(invokedOnce).toBe(true);
    expect(invokedNormal).toBe(true);
    invokedOnce = false;
    invokedNormal = false;
    et.dispatchEvent(new Event("test"));
    expect(invokedOnce).toBe(false);
    expect(invokedNormal).toBe(true);
  });

  test("inner invoke step 2.5: a once listener is removed before it runs, so nested dispatches skip it", () => {
    const et = new EventTarget();
    let invokedCount = 0;
    function handler() {
      invokedCount++;
      if (invokedCount === 1) et.dispatchEvent(new Event("test"));
    }
    et.addEventListener("test", handler, { once: true });
    et.dispatchEvent(new Event("test"));
    expect(invokedCount).toBe(1);

    invokedCount = 0;
    function handler2() {
      invokedCount++;
      if (invokedCount === 1) et.addEventListener("test", handler2, { once: true });
      if (invokedCount <= 2) et.dispatchEvent(new Event("test"));
    }
    et.addEventListener("test", handler2, { once: true });
    et.dispatchEvent(new Event("test"));
    expect(invokedCount).toBe(2);
  });

  test("once listeners are added / removed like normal listeners", () => {
    let invokedCount = 0;
    const handler = () => invokedCount++;
    const et = new EventTarget();
    et.addEventListener("test", handler, { once: true });
    et.addEventListener("test", handler);
    et.dispatchEvent(new Event("test"));
    expect(invokedCount).toBe(1);
    invokedCount = 0;
    et.dispatchEvent(new Event("test"));
    expect(invokedCount).toBe(0);
    invokedCount = 0;
    et.addEventListener("test", handler, { once: true });
    et.removeEventListener("test", handler);
    et.dispatchEvent(new Event("test"));
    expect(invokedCount).toBe(0);
  });

  test("multiple once listeners are each invoked even when stopImmediatePropagation is set", () => {
    const et = new EventTarget();
    let invokedCount = 0;
    for (let n = 4; n > 0; n--) {
      et.addEventListener(
        "test",
        (e) => {
          invokedCount++;
          e.stopImmediatePropagation();
        },
        { once: true },
      );
    }
    for (let n = 4; n > 0; n--) et.dispatchEvent(new Event("test"));
    expect(invokedCount).toBe(4);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/AddEventListenerOptions-passive.any.js
describe("passive option — https://dom.spec.whatwg.org/#dom-addeventlisteneroptions-passive", () => {
  test("only addEventListener reads the passive option", () => {
    let supportsPassive = false;
    const options = {
      get passive() {
        supportsPassive = true;
        return false;
      },
      get dummy() {
        throw new Error("dummy value getter invoked");
      },
    };
    const et = new EventTarget();
    et.addEventListener("test_event", null, options);
    expect(supportsPassive).toBe(true);
    supportsPassive = false;
    et.removeEventListener("test_event", null, options as never);
    expect(supportsPassive).toBe(false);
  });

  function testPassiveValue(optionsValue: unknown, expectedDefaultPrevented: boolean, existing?: EventTarget, viaReturnValue = false) {
    let defaultPrevented: boolean | undefined;
    const handler = (e: Event) => {
      expect(e.defaultPrevented).toBe(false);
      if (viaReturnValue) e.returnValue = false;
      else e.preventDefault();
      defaultPrevented = e.defaultPrevented;
    };
    const et = existing ?? new EventTarget();
    et.addEventListener("test", handler, optionsValue as boolean);
    const uncanceled = et.dispatchEvent(new Event("test", { bubbles: true, cancelable: true }));
    expect(defaultPrevented, JSON.stringify(optionsValue)).toBe(expectedDefaultPrevented);
    expect(uncanceled).toBe(!expectedDefaultPrevented);
    et.removeEventListener("test", handler, optionsValue as boolean);
  }

  test("preventDefault is ignored if-and-only-if the passive option is true", () => {
    testPassiveValue(undefined, true);
    testPassiveValue({}, true);
    testPassiveValue({ passive: false }, true);
    testPassiveValue({ passive: true }, false);
    testPassiveValue({ passive: 0 }, true);
    testPassiveValue({ passive: 1 }, false);
  });

  test("returnValue = false is ignored if-and-only-if the passive option is true", () => {
    testPassiveValue(undefined, true, undefined, true);
    testPassiveValue({}, true, undefined, true);
    testPassiveValue({ passive: false }, true, undefined, true);
    testPassiveValue({ passive: true }, false, undefined, true);
    testPassiveValue({ passive: 0 }, true, undefined, true);
    testPassiveValue({ passive: 1 }, false, undefined, true);
  });

  test("passive behavior of one listener is unaffected by other listeners", () => {
    function withOthers(optionsValue: unknown, expected: boolean) {
      let invoked1 = false;
      let invoked2 = false;
      const dummy1 = () => (invoked1 = true);
      const dummy2 = () => (invoked2 = true);
      const et = new EventTarget();
      et.addEventListener("test", dummy1, { passive: true });
      et.addEventListener("test", dummy2);
      testPassiveValue(optionsValue, expected, et);
      expect(invoked1).toBe(true);
      expect(invoked2).toBe(true);
    }
    withOthers({}, true);
    withOthers({ passive: false }, true);
    withOthers({ passive: true }, false);
  });

  test("equivalence of option values (passive does not distinguish listeners)", () => {
    function testOptionEquivalence(o1: unknown, o2: unknown, expectedEquality: boolean) {
      let invocationCount = 0;
      const handler = () => invocationCount++;
      const et = new EventTarget();
      et.addEventListener("test", handler, o1 as boolean);
      et.addEventListener("test", handler, o2 as boolean);
      et.dispatchEvent(new Event("test", { bubbles: true }));
      expect(invocationCount).toBe(expectedEquality ? 1 : 2);
    }
    testOptionEquivalence({ capture: true }, { capture: false, passive: false }, false);
    testOptionEquivalence({ capture: true }, { passive: true }, false);
    testOptionEquivalence({}, { passive: false }, true);
    testOptionEquivalence({ passive: true }, { passive: false }, true);
    testOptionEquivalence(undefined, { passive: true }, true);
    testOptionEquivalence({ capture: true, passive: false }, { capture: true, passive: true }, true);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/passive-by-default.html
describe("default passive value — https://dom.spec.whatwg.org/#default-passive-value", () => {
  const eventNames: Record<string, boolean> = { touchstart: true, touchmove: true, wheel: true, mousewheel: true, touchend: false };

  function isListenerPassive(eventName: string, eventTarget: EventTarget, passive: unknown, expectPassive: boolean) {
    let defaultPrevented: boolean | null = null;
    const handler = (event: Event) => {
      event.preventDefault();
      defaultPrevented = event.defaultPrevented;
      eventTarget.removeEventListener(eventName, handler);
    };
    if (passive === "omitted") eventTarget.addEventListener(eventName, handler);
    else eventTarget.addEventListener(eventName, handler, { passive: passive as boolean });
    const ret = eventTarget.dispatchEvent(new Event(eventName, { cancelable: true }));
    const label = `${eventName} on ${eventTarget.constructor.name} with passive=${String(passive)}`;
    expect(defaultPrevented, label).toBe(!expectPassive);
    expect(ret, label).toBe(expectPassive);
  }

  test("touchstart/touchmove/wheel/mousewheel are passive by default on window, document, html and body only", () => {
    const div = document.body!.appendChild(document.createElement("div"));
    for (const eventName in eventNames) {
      for (const eventTarget of [window, document, document.documentElement!, document.body!] as EventTarget[]) {
        isListenerPassive(eventName, eventTarget, "omitted", eventNames[eventName]);
        isListenerPassive(eventName, eventTarget, undefined, eventNames[eventName]);
        isListenerPassive(eventName, eventTarget, false, false);
        isListenerPassive(eventName, eventTarget, true, true);
      }
      isListenerPassive(eventName, div, "omitted", false);
      isListenerPassive(eventName, div, undefined, false);
      isListenerPassive(eventName, div, false, false);
      isListenerPassive(eventName, div, true, true);
    }
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/AddEventListenerOptions-signal.any.js
describe("signal option — https://dom.spec.whatwg.org/#dom-addeventlisteneroptions-signal", () => {
  test("aborting the signal removes the listener; an aborted signal never adds it", () => {
    let count = 0;
    const handler = () => count++;
    const et = new EventTarget();
    const controller = new AbortController();
    et.addEventListener("test", handler, { signal: controller.signal });
    et.dispatchEvent(new Event("test"));
    expect(count).toBe(1);
    et.dispatchEvent(new Event("test"));
    expect(count).toBe(2);
    controller.abort();
    et.dispatchEvent(new Event("test"));
    expect(count).toBe(2);
    et.addEventListener("test", handler, { signal: controller.signal });
    et.dispatchEvent(new Event("test"));
    expect(count).toBe(2);
  });

  test("a signal does not prevent removeEventListener", () => {
    let count = 0;
    const handler = () => count++;
    const et = new EventTarget();
    const controller = new AbortController();
    et.addEventListener("test", handler, { signal: controller.signal });
    et.removeEventListener("test", handler);
    et.dispatchEvent(new Event("test"));
    expect(count).toBe(0);
  });

  test("works with once, capture and multiple listeners", () => {
    let count = 0;
    const handler = () => count++;
    const et = new EventTarget();
    const controller = new AbortController();
    et.addEventListener("test", handler, { signal: controller.signal, once: true });
    et.addEventListener("first", handler, { signal: controller.signal, once: true });
    et.addEventListener("second", handler, { signal: controller.signal, once: true });
    et.addEventListener("cap", handler, { signal: controller.signal, capture: true });
    controller.abort();
    for (const type of ["test", "first", "second", "cap"]) et.dispatchEvent(new Event(type));
    expect(count).toBe(0);
  });

  test("removing a once listener works with a passed signal", () => {
    let count = 0;
    const handler = () => count++;
    const et = new EventTarget();
    const controller = new AbortController();
    et.addEventListener("test", handler, { signal: controller.signal, once: true });
    et.removeEventListener("test", handler);
    et.dispatchEvent(new Event("test"));
    expect(count).toBe(0);
  });

  test("aborting from a listener does not call future listeners", () => {
    let count = 0;
    const handler = () => count++;
    const et = new EventTarget();
    const controller = new AbortController();
    et.addEventListener("test", () => controller.abort(), { signal: controller.signal });
    et.addEventListener("test", handler, { signal: controller.signal });
    et.dispatchEvent(new Event("test"));
    expect(count).toBe(0);
  });

  test("adding then aborting a listener in another listener does not call it", () => {
    let count = 0;
    const handler = () => count++;
    const et = new EventTarget();
    const controller = new AbortController();
    et.addEventListener(
      "test",
      () => {
        et.addEventListener("test", handler, { signal: controller.signal });
        controller.abort();
      },
      { signal: controller.signal },
    );
    et.dispatchEvent(new Event("test"));
    expect(count).toBe(0);
  });

  test("aborting from a nested listener removes it", () => {
    const et = new EventTarget();
    const ac = new AbortController();
    let count = 0;
    et.addEventListener(
      "foo",
      () => {
        et.addEventListener(
          "foo",
          () => {
            count++;
            if (count > 5) ac.abort();
            et.dispatchEvent(new Event("foo"));
          },
          { signal: ac.signal },
        );
        et.dispatchEvent(new Event("foo"));
      },
      { once: true },
    );
    et.dispatchEvent(new Event("foo"));
    expect(count).toBe(6);
  });

  test("null as the signal throws TypeError (even with a null listener)", () => {
    const et = new EventTarget();
    expect(() => et.addEventListener("foo", () => {}, { signal: null as never })).toThrow(TypeError);
    expect(() => et.addEventListener("foo", null, { signal: null as never })).toThrow(TypeError);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/EventListener-handleEvent.html
describe("callback interface — https://dom.spec.whatwg.org/#callbackdef-eventlistener", () => {
  test("calls the handleEvent method of an EventListener object with this = the object", () => {
    const type = "foo";
    const target = document.createElement("div");
    let that: unknown;
    let seen: Event | null = null;
    const eventListener = {
      handleEvent(evt: Event) {
        that = this;
        seen = evt;
      },
    };
    target.addEventListener(type, eventListener);
    target.dispatchEvent(new Event(type));
    expect(seen!.type).toBe(type);
    expect(seen!.target).toBe(target);
    expect(seen!.srcElement).toBe(target);
    expect(that).toBe(eventListener);
  });

  test("performs Get(handleEvent) every time the event is dispatched", () => {
    const target = document.createElement("div");
    let calls = 0;
    target.addEventListener("foo", {
      get handleEvent() {
        calls++;
        return () => {};
      },
    });
    expect(calls).toBe(0);
    target.dispatchEvent(new Event("foo"));
    target.dispatchEvent(new Event("foo"));
    expect(calls).toBe(2);
  });

  test("does not call handleEvent on a callable listener", () => {
    const target = document.createElement("div");
    let calls = 0;
    const eventListener = Object.assign(() => calls++, {
      handleEvent() {
        throw new Error("handleEvent should not be called on functions");
      },
    });
    target.addEventListener("foo", eventListener);
    target.dispatchEvent(new Event("foo"));
    expect(calls).toBe(1);
  });

  test("errors getting handleEvent, and non-callable handleEvent, are reported on the window", () => {
    const target = document.createElement("div");
    const errors: unknown[] = [];
    window.addEventListener("error", (e) => {
      errors.push((e as unknown as { error: unknown }).error);
      e.preventDefault();
    });
    const error = { name: "test" };
    target.addEventListener("foo", {
      get handleEvent(): never {
        throw error;
      },
    });
    target.addEventListener("bar", { handleEvent: null } as never);
    target.addEventListener("baz", { handleEvent: 42 } as never);
    target.dispatchEvent(new Event("foo"));
    target.dispatchEvent(new Event("bar"));
    target.dispatchEvent(new Event("baz"));
    expect(errors[0]).toBe(error);
    expect(errors[1]).toBeInstanceOf(TypeError);
    expect(errors[2]).toBeInstanceOf(TypeError);
  });

  test("a function listener is called with this = currentTarget", () => {
    const target = document.createElement("div");
    let self: unknown;
    target.addEventListener("foo", function (this: unknown) {
      self = this;
    });
    target.dispatchEvent(new Event("foo"));
    expect(self).toBe(target);
  });
});

describe("listener list mutation during dispatch — https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke", () => {
  test("step 2.2: a listener removed by an earlier listener (removed flag) is not invoked", () => {
    const et = new EventTarget();
    const calls: string[] = [];
    const b = () => calls.push("b");
    et.addEventListener("x", () => {
      calls.push("a");
      et.removeEventListener("x", b);
    });
    et.addEventListener("x", b);
    et.dispatchEvent(new Event("x"));
    expect(calls).toEqual(["a"]);
  });

  test("step 1: listeners added to the current target during invocation are not invoked for this event", () => {
    const et = new EventTarget();
    const calls: string[] = [];
    et.addEventListener("x", () => {
      calls.push("a");
      et.addEventListener("x", () => calls.push("late"));
    });
    et.dispatchEvent(new Event("x"));
    expect(calls).toEqual(["a"]);
    et.dispatchEvent(new Event("x"));
    expect(calls).toEqual(["a", "a", "late"]);
  });

  test("removing and re-adding the same callback during dispatch does not invoke it twice", () => {
    const et = new EventTarget();
    let count = 0;
    const fn = () => {
      count++;
      et.removeEventListener("x", fn);
      et.addEventListener("x", fn);
    };
    et.addEventListener("x", fn);
    et.dispatchEvent(new Event("x"));
    expect(count).toBe(1);
  });
});
