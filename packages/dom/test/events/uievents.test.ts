/**
 * Event subclass constructors, init dictionaries, getters and legacy members.
 *
 * Specs:
 *   UI Events — https://w3c.github.io/uievents/#idl-uievent (UIEvent, FocusEvent, MouseEvent,
 *     WheelEvent, InputEvent, KeyboardEvent, CompositionEvent, legacy initializers)
 *   CSSOM View — https://drafts.csswg.org/cssom-view/#extensions-to-the-mouseevent-interface
 *   Pointer Events — https://w3c.github.io/pointerevents/#pointerevent-interface
 *   Touch Events — https://w3c.github.io/touch-events/#touchevent-interface
 *   HTML — https://html.spec.whatwg.org/#the-dragevent-interface, ErrorEvent, MessageEvent,
 *     PopStateEvent, HashChangeEvent, PageTransitionEvent, StorageEvent, SubmitEvent,
 *     FormDataEvent, ToggleEvent, PromiseRejectionEvent
 *   DOM — https://dom.spec.whatwg.org/#interface-customevent
 *
 * Ported from WPT dom/events/Event-subclasses-constructors.html and uievents/constructors/*
 * (links per describe block); original assertions kept where applicable.
 */
import { beforeEach, describe, expect, test } from "vitest";
import {
  AnimationEvent,
  ClipboardEvent,
  CloseEvent,
  CompositionEvent,
  CustomEvent,
  DataTransfer,
  DragEvent,
  ErrorEvent,
  Event,
  FocusEvent,
  FormDataEvent,
  HashChangeEvent,
  InputEvent,
  KeyboardEvent,
  MessageEvent,
  MouseEvent,
  PageTransitionEvent,
  PointerEvent,
  PopStateEvent,
  ProgressEvent,
  PromiseRejectionEvent,
  StorageEvent,
  SubmitEvent,
  ToggleEvent,
  Touch,
  TouchEvent,
  TouchList,
  TransitionEvent,
  UIEvent,
  WheelEvent,
  BeforeUnloadEvent,
  type Document,
  type Window,
} from "@rtd/dom";
import { setup } from "./helpers.ts";

let window: Window;
let document: Document;

beforeEach(() => {
  ({ window, document } = setup());
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-subclasses-constructors.html
describe("subclass constructors — https://dom.spec.whatwg.org/#constructing-events", () => {
  const ctors = {
    Event,
    UIEvent,
    FocusEvent,
    MouseEvent,
    WheelEvent,
    KeyboardEvent,
    CompositionEvent,
    InputEvent,
    PointerEvent,
    DragEvent,
    TouchEvent,
    ClipboardEvent,
    CustomEvent,
    ErrorEvent,
    MessageEvent,
    ProgressEvent,
    AnimationEvent,
    TransitionEvent,
    PopStateEvent,
    HashChangeEvent,
    PageTransitionEvent,
    StorageEvent,
    SubmitEvent,
    ToggleEvent,
    CloseEvent,
  } as Record<string, new (type: string, init?: object) => Event>;

  for (const [name, Ctor] of Object.entries(ctors)) {
    test(`${name}: requires a type, inherits Event init members, has the interface toStringTag`, () => {
      expect(() => new (Ctor as unknown as new () => Event)()).toThrow(TypeError);
      expect(() => (Ctor as unknown as (t: string) => Event)("x")).toThrow(TypeError);
      const e = new Ctor("type", { bubbles: true, cancelable: true, composed: true });
      expect(e).toBeInstanceOf(Event);
      expect(e.type).toBe("type");
      expect(e.bubbles).toBe(true);
      expect(e.cancelable).toBe(true);
      expect(e.composed).toBe(true);
      expect(e.isTrusted).toBe(false);
      expect(Object.prototype.toString.call(e)).toBe(`[object ${name}]`);
    });
  }

  test("interfaces with required members throw without them", () => {
    expect(() => new PromiseRejectionEvent("x", {} as never)).toThrow(TypeError);
    expect(() => new (PromiseRejectionEvent as unknown as new (t: string) => Event)("x")).toThrow(TypeError);
    expect(() => new FormDataEvent("x", {} as never)).toThrow(TypeError);
    const p = Promise.resolve();
    expect(new PromiseRejectionEvent("x", { promise: p, reason: 1 }).promise).toBe(p);
    const fd = {};
    expect(new FormDataEvent("x", { formData: fd }).formData).toBe(fd);
  });

  test("BeforeUnloadEvent and TouchList have no public constructor", () => {
    expect(() => new (BeforeUnloadEvent as unknown as new (t: string) => Event)("x")).toThrow(TypeError);
    expect(() => new (TouchList as unknown as new () => object)()).toThrow(TypeError);
    const e = document.createEvent("BeforeUnloadEvent") as unknown as { returnValue: string };
    expect(e.returnValue).toBe("");
    e.returnValue = "leave?";
    expect(e.returnValue).toBe("leave?");
  });
});

describe("UIEvent — https://w3c.github.io/uievents/#interface-uievent", () => {
  test("defaults and init members", () => {
    const e = new UIEvent("x");
    expect(e.view).toBeNull();
    expect(e.detail).toBe(0);
    expect(e.which).toBe(0);
    const f = new UIEvent("x", { view: window, detail: 5, which: 3 });
    expect(f.view).toBe(window);
    expect(f.detail).toBe(5);
    expect(f.which).toBe(3);
  });

  test("view must be a Window", () => {
    expect(() => new UIEvent("x", { view: {} as never })).toThrow(TypeError);
    expect(() => new MouseEvent("x", { view: document as never })).toThrow(TypeError);
  });

  test("initUIEvent (legacy)", () => {
    const e = document.createEvent("UIEvent") as UIEvent;
    e.initUIEvent("foo", true, true, window, 7);
    expect([e.type, e.bubbles, e.cancelable, e.view, e.detail]).toEqual(["foo", true, true, window, 7]);
    expect(() => e.initUIEvent("foo", true, true, {} as never, 7)).toThrow(TypeError);
  });

  test("detail is a WebIDL long", () => {
    expect(new UIEvent("x", { detail: 2 ** 32 + 5 }).detail).toBe(5);
    expect(new UIEvent("x", { detail: "12" as never }).detail).toBe(12);
    expect(new UIEvent("x", { detail: NaN }).detail).toBe(0);
  });
});

describe("MouseEvent — https://w3c.github.io/uievents/#interface-mouseevent", () => {
  test("defaults", () => {
    const e = new MouseEvent("click");
    for (const k of ["screenX", "screenY", "clientX", "clientY", "pageX", "pageY", "offsetX", "offsetY", "x", "y", "movementX", "movementY", "button", "buttons", "detail"] as const) {
      expect(e[k], k).toBe(0);
    }
    for (const k of ["ctrlKey", "shiftKey", "altKey", "metaKey"] as const) expect(e[k]).toBe(false);
    expect(e.relatedTarget).toBeNull();
  });

  test("coordinates are doubles; page/offset/x/y mirror client coordinates (no layout)", () => {
    const e = new MouseEvent("click", { screenX: 1.5, screenY: 2, clientX: 10.25, clientY: 20, movementX: -3, movementY: 4 });
    expect([e.screenX, e.screenY, e.clientX, e.clientY]).toEqual([1.5, 2, 10.25, 20]);
    expect([e.x, e.y, e.pageX, e.pageY, e.offsetX, e.offsetY]).toEqual([10.25, 20, 10.25, 20, 10.25, 20]);
    expect([e.movementX, e.movementY]).toEqual([-3, 4]);
    expect(() => new MouseEvent("click", { clientX: Infinity })).toThrow(TypeError);
  });

  test("button is a short, buttons an unsigned short", () => {
    expect(new MouseEvent("x", { button: 2 }).button).toBe(2);
    expect(new MouseEvent("x", { button: -1 }).button).toBe(-1);
    expect(new MouseEvent("x", { button: 65537 }).button).toBe(1);
    expect(new MouseEvent("x", { buttons: -1 }).buttons).toBe(65535);
  });

  test("relatedTarget and modifier keys", () => {
    const div = document.createElement("div");
    const e = new MouseEvent("mouseover", { relatedTarget: div, ctrlKey: true, metaKey: true });
    expect(e.relatedTarget).toBe(div);
    expect(e.ctrlKey).toBe(true);
    expect(e.metaKey).toBe(true);
    expect(e.altKey).toBe(false);
  });

  test("attributes are read-only accessors", () => {
    const e = new MouseEvent("click", { clientX: 5 });
    expect(() => {
      (e as unknown as { clientX: number }).clientX = 9;
    }).toThrow(TypeError);
    // Testing Library defines own properties on events; that must keep working.
    Object.defineProperty(e, "clientX", { value: 9 });
    expect(e.clientX).toBe(9);
  });

  test("initMouseEvent (legacy)", () => {
    const rt = document.createElement("span");
    const e = document.createEvent("MouseEvents") as MouseEvent;
    e.initMouseEvent("click", true, true, window, 1, 2, 3, 4, 5, true, false, true, false, 1, rt);
    expect([e.type, e.bubbles, e.cancelable, e.view, e.detail]).toEqual(["click", true, true, window, 1]);
    expect([e.screenX, e.screenY, e.clientX, e.clientY]).toEqual([2, 3, 4, 5]);
    expect([e.ctrlKey, e.altKey, e.shiftKey, e.metaKey]).toEqual([true, false, true, false]);
    expect(e.button).toBe(1);
    expect(e.relatedTarget).toBe(rt);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/uievents/constructors/event-getmodifierstate.html (not in the jsdom WPT copy; written from the spec)
describe("getModifierState — https://w3c.github.io/uievents/#dom-mouseevent-getmodifierstate", () => {
  const modifiers: Record<string, string> = {
    Control: "ctrlKey",
    Shift: "shiftKey",
    Alt: "altKey",
    Meta: "metaKey",
    AltGraph: "modifierAltGraph",
    CapsLock: "modifierCapsLock",
    Fn: "modifierFn",
    FnLock: "modifierFnLock",
    Hyper: "modifierHyper",
    NumLock: "modifierNumLock",
    ScrollLock: "modifierScrollLock",
    Super: "modifierSuper",
    Symbol: "modifierSymbol",
    SymbolLock: "modifierSymbolLock",
  };
  for (const Ctor of [MouseEvent, KeyboardEvent, PointerEvent, WheelEvent, TouchEvent]) {
    test(`${Ctor.name}: each modifier init member maps to its key`, () => {
      for (const [key, member] of Object.entries(modifiers)) {
        const e = new Ctor("x", { [member]: true } as never) as MouseEvent;
        for (const other of Object.keys(modifiers)) expect(e.getModifierState(other), `${member} → ${other}`).toBe(other === key);
      }
      expect((new Ctor("x", { ctrlKey: true }) as MouseEvent).getModifierState("Accel")).toBe(false);
      expect((new Ctor("x", { ctrlKey: true }) as MouseEvent).getModifierState("control")).toBe(false);
    });
  }
});

describe("PointerEvent — https://w3c.github.io/pointerevents/#pointerevent-interface", () => {
  test("defaults", () => {
    const e = new PointerEvent("pointerdown");
    expect(e).toBeInstanceOf(MouseEvent);
    expect(e.pointerId).toBe(0);
    expect(e.width).toBe(1);
    expect(e.height).toBe(1);
    expect(e.pressure).toBe(0);
    expect(e.tangentialPressure).toBe(0);
    expect(e.tiltX).toBe(0);
    expect(e.tiltY).toBe(0);
    expect(e.twist).toBe(0);
    expect(e.altitudeAngle).toBe(Math.PI / 2);
    expect(e.azimuthAngle).toBe(0);
    expect(e.pointerType).toBe("");
    expect(e.isPrimary).toBe(false);
    expect(e.persistentDeviceId).toBe(0);
    expect(e.getCoalescedEvents()).toEqual([]);
    expect(e.getPredictedEvents()).toEqual([]);
  });

  test("init members; pressure is a float", () => {
    const e = new PointerEvent("pointermove", { pointerId: 3, width: 2.5, height: 4, pressure: 0.3, pointerType: "pen", isPrimary: true, twist: 90 });
    expect([e.pointerId, e.width, e.height, e.pointerType, e.isPrimary, e.twist]).toEqual([3, 2.5, 4, "pen", true, 90]);
    expect(e.pressure).toBe(Math.fround(0.3));
  });

  // https://w3c.github.io/pointerevents/#converting-between-tiltx-tilty-and-altitudeangle-azimuthangle
  test("tilt and altitude/azimuth are derived from each other when only one pair is given", () => {
    const fromTilt = new PointerEvent("x", { tiltX: 45, tiltY: 0 });
    expect(fromTilt.altitudeAngle).toBeCloseTo(Math.PI / 4);
    expect(fromTilt.azimuthAngle).toBe(0);
    const fromAngles = new PointerEvent("x", { altitudeAngle: Math.PI / 4, azimuthAngle: Math.PI / 2 });
    expect(fromAngles.tiltX).toBe(0);
    expect(fromAngles.tiltY).toBe(45);
  });

  test("coalesced and predicted event lists are copied", () => {
    const a = new PointerEvent("pointermove");
    const e = new PointerEvent("pointermove", { coalescedEvents: [a], predictedEvents: [a] });
    expect(e.getCoalescedEvents()).toEqual([a]);
    expect(e.getCoalescedEvents()).not.toBe(e.getCoalescedEvents());
    expect(e.getPredictedEvents()).toEqual([a]);
  });
});

describe("WheelEvent — https://w3c.github.io/uievents/#interface-wheelevent", () => {
  test("deltas, deltaMode and constants", () => {
    const e = new WheelEvent("wheel", { deltaX: 1, deltaY: -2.5, deltaZ: 3, deltaMode: WheelEvent.DOM_DELTA_LINE });
    expect([e.deltaX, e.deltaY, e.deltaZ, e.deltaMode]).toEqual([1, -2.5, 3, 1]);
    expect([WheelEvent.DOM_DELTA_PIXEL, WheelEvent.DOM_DELTA_LINE, WheelEvent.DOM_DELTA_PAGE]).toEqual([0, 1, 2]);
    expect((e as unknown as { DOM_DELTA_PAGE: number }).DOM_DELTA_PAGE).toBe(2);
    expect(e).toBeInstanceOf(MouseEvent);
  });
});

describe("KeyboardEvent — https://w3c.github.io/uievents/#interface-keyboardevent", () => {
  test("defaults", () => {
    const e = new KeyboardEvent("keydown");
    expect([e.key, e.code, e.location, e.repeat, e.isComposing, e.charCode, e.keyCode, e.which]).toEqual(["", "", 0, false, false, 0, 0, 0]);
  });

  test("init members, legacy keyCode/charCode/which from the dictionary", () => {
    const e = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", location: 3, repeat: true, isComposing: true, keyCode: 13, charCode: 0, which: 13, shiftKey: true });
    expect([e.key, e.code, e.location, e.repeat, e.isComposing, e.keyCode, e.which, e.shiftKey]).toEqual(["Enter", "Enter", 3, true, true, 13, 13, true]);
  });

  test("location constants", () => {
    expect([KeyboardEvent.DOM_KEY_LOCATION_STANDARD, KeyboardEvent.DOM_KEY_LOCATION_LEFT, KeyboardEvent.DOM_KEY_LOCATION_RIGHT, KeyboardEvent.DOM_KEY_LOCATION_NUMPAD]).toEqual([0, 1, 2, 3]);
  });

  test("initKeyboardEvent (legacy)", () => {
    const e = document.createEvent("KeyboardEvent") as KeyboardEvent;
    e.initKeyboardEvent("keyup", true, false, window, "a", 1, true, true, false, false);
    expect([e.type, e.bubbles, e.cancelable, e.view, e.key, e.location, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey]).toEqual(["keyup", true, false, window, "a", 1, true, true, false, false]);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/uievents/constructors/inputevent-constructor.html
describe("InputEvent — https://w3c.github.io/uievents/#interface-inputevent", () => {
  test("defaults: data null, isComposing false, inputType empty, dataTransfer null", () => {
    const e = new InputEvent("type");
    expect(e.data).toBeNull();
    expect(e.isComposing).toBe(false);
    expect(e.inputType).toBe("");
    expect(e.dataTransfer).toBeNull();
    // Deviation (docs/deviations.md): no getTargetRanges(), like jsdom/happy-dom (feature-detected
    // by React Aria and editors to pick native beforeinput handling).
    expect("getTargetRanges" in e).toBe(false);
  });

  test("data, isComposing, inputType from the dictionary", () => {
    let e = new InputEvent("type", { data: "", isComposing: true });
    expect(e.data).toBe("");
    expect(e.isComposing).toBe(true);
    e = new InputEvent("type", { data: "data", isComposing: false });
    expect(e.data).toBe("data");
    e = new InputEvent("type", { data: null });
    expect(e.data).toBeNull();
    e = new InputEvent("type", { inputType: "insertText" });
    expect(e.inputType).toBe("insertText");
    e = new InputEvent("type", { inputType: "foo" });
    expect(e.inputType).toBe("foo");
    const dt = new DataTransfer();
    expect(new InputEvent("beforeinput", { dataTransfer: dt }).dataTransfer).toBe(dt);
  });
});

describe("CompositionEvent / FocusEvent — https://w3c.github.io/uievents/#interface-compositionevent", () => {
  test("CompositionEvent data and initCompositionEvent", () => {
    expect(new CompositionEvent("compositionstart").data).toBe("");
    expect(new CompositionEvent("compositionupdate", { data: "あ" }).data).toBe("あ");
    const e = document.createEvent("CompositionEvent") as CompositionEvent;
    e.initCompositionEvent("compositionend", true, true, window, "x");
    expect([e.type, e.data, e.view]).toEqual(["compositionend", "x", window]);
  });

  test("FocusEvent relatedTarget", () => {
    const other = document.createElement("input");
    expect(new FocusEvent("focus").relatedTarget).toBeNull();
    expect(new FocusEvent("blur", { relatedTarget: other }).relatedTarget).toBe(other);
  });
});

describe("TouchEvent, Touch, TouchList — https://w3c.github.io/touch-events/", () => {
  test("Touch requires identifier and target; TouchList is indexable", () => {
    const el = document.createElement("div");
    expect(() => new Touch({} as never)).toThrow(TypeError);
    expect(() => new Touch({ identifier: 1 } as never)).toThrow(TypeError);
    const touch = new Touch({ identifier: 1, target: el, clientX: 5, clientY: 6, force: 0.5 });
    expect([touch.identifier, touch.target, touch.clientX, touch.clientY, touch.touchType]).toEqual([1, el, 5, 6, "direct"]);
    const e = new TouchEvent("touchstart", { touches: [touch], changedTouches: [touch], altKey: true });
    expect(e.touches.length).toBe(1);
    expect(e.touches[0]).toBe(touch);
    expect(e.touches.item(0)).toBe(touch);
    expect(e.touches.item(1)).toBeNull();
    expect([...e.changedTouches]).toEqual([touch]);
    expect(e.targetTouches.length).toBe(0);
    expect(e.altKey).toBe(true);
    expect(() => new TouchEvent("touchstart", { touches: [1] as never })).toThrow(TypeError);
  });

  // Deviation (docs/deviations.md): touch-like plain objects are accepted and kept as-is, like jsdom.
  test("touch-like plain objects in touches/targetTouches/changedTouches are exposed unchanged", () => {
    const el = document.body!.appendChild(document.createElement("div"));
    const plain = { identifier: 0, clientX: 1, clientY: 2, target: el };
    const e = new TouchEvent("touchstart", { bubbles: true, touches: [plain], changedTouches: [{ clientX: 3 }] } as never);
    expect(e.touches[0]).toBe(plain);
    expect(e.touches[0].clientX).toBe(1);
    expect(e.changedTouches.item(0)!.clientX).toBe(3);
    let received: TouchEvent | null = null;
    document.addEventListener("touchstart", (ev) => (received = ev as TouchEvent));
    el.dispatchEvent(e);
    expect(received).toBe(e);
  });
});

describe("DragEvent / ClipboardEvent — https://html.spec.whatwg.org/#the-dragevent-interface", () => {
  test("dataTransfer / clipboardData default to null and accept DataTransfer (or plain objects, leniently)", () => {
    expect(new DragEvent("drop").dataTransfer).toBeNull();
    expect(new ClipboardEvent("paste").clipboardData).toBeNull();
    const dt = new DataTransfer();
    expect(new DragEvent("drop", { dataTransfer: dt }).dataTransfer).toBe(dt);
    expect(new ClipboardEvent("copy", { clipboardData: dt }).clipboardData).toBe(dt);
    const plain = { files: [] };
    expect(new DragEvent("drop", { dataTransfer: plain as never }).dataTransfer).toBe(plain);
    expect(new DragEvent("drop")).toBeInstanceOf(MouseEvent);
  });
});

describe("other HTML / CSS / DOM event interfaces", () => {
  test("CustomEvent detail and initCustomEvent", () => {
    expect(new CustomEvent("x").detail).toBeNull();
    const e = document.createEvent("CustomEvent") as CustomEvent;
    e.initCustomEvent("y", true, false, { a: 1 });
    expect([e.type, e.bubbles, e.cancelable, e.detail]).toEqual(["y", true, false, { a: 1 }]);
  });

  test("ErrorEvent", () => {
    const err = new Error("x");
    const e = new ErrorEvent("error", { message: "m", filename: "f.js", lineno: 3, colno: 4, error: err });
    expect([e.message, e.filename, e.lineno, e.colno, e.error]).toEqual(["m", "f.js", 3, 4, err]);
    const d = new ErrorEvent("error");
    expect([d.message, d.filename, d.lineno, d.colno, d.error]).toEqual(["", "", 0, 0, undefined]);
  });

  test("MessageEvent and initMessageEvent", () => {
    const e = new MessageEvent("message", { data: { a: 1 }, origin: "http://x", lastEventId: "7", source: window, ports: [] });
    expect([e.data, e.origin, e.lastEventId, e.source]).toEqual([{ a: 1 }, "http://x", "7", window]);
    expect(Object.isFrozen(e.ports)).toBe(true);
    expect(new MessageEvent("message").data).toBeNull();
    const m = document.createEvent("MessageEvent") as MessageEvent;
    m.initMessageEvent("message", false, false, 5, "o", "id", null, []);
    expect([m.type, m.data, m.origin, m.lastEventId]).toEqual(["message", 5, "o", "id"]);
  });

  test("ProgressEvent, AnimationEvent, TransitionEvent", () => {
    const p = new ProgressEvent("progress", { lengthComputable: true, loaded: 5, total: 10 });
    expect([p.lengthComputable, p.loaded, p.total]).toEqual([true, 5, 10]);
    const a = new AnimationEvent("animationend", { animationName: "spin", elapsedTime: 1.5, pseudoElement: "::before" });
    expect([a.animationName, a.elapsedTime, a.pseudoElement]).toEqual(["spin", 1.5, "::before"]);
    const t = new TransitionEvent("transitionend", { propertyName: "opacity", elapsedTime: 0.2 });
    expect([t.propertyName, t.elapsedTime, t.pseudoElement]).toEqual(["opacity", 0.2, ""]);
  });

  test("PopStateEvent, HashChangeEvent, PageTransitionEvent, StorageEvent", () => {
    expect(new PopStateEvent("popstate").state).toBeNull();
    expect(new PopStateEvent("popstate", { state: { s: 1 } }).state).toEqual({ s: 1 });
    const h = new HashChangeEvent("hashchange", { oldURL: "a", newURL: "b" });
    expect([h.oldURL, h.newURL]).toEqual(["a", "b"]);
    expect(new PageTransitionEvent("pageshow", { persisted: true }).persisted).toBe(true);
    const s = new StorageEvent("storage", { key: "k", oldValue: null, newValue: "v", url: "u" });
    expect([s.key, s.oldValue, s.newValue, s.url, s.storageArea]).toEqual(["k", null, "v", "u", null]);
    const s2 = document.createEvent("StorageEvent") as StorageEvent;
    s2.initStorageEvent("storage", false, false, "a", "b", "c", "d", null);
    expect([s2.key, s2.oldValue, s2.newValue, s2.url]).toEqual(["a", "b", "c", "d"]);
  });

  test("SubmitEvent, ToggleEvent, CloseEvent", () => {
    const button = document.createElement("button");
    expect(new SubmitEvent("submit").submitter).toBeNull();
    expect(new SubmitEvent("submit", { submitter: button }).submitter).toBe(button);
    const t = new ToggleEvent("toggle", { oldState: "closed", newState: "open" });
    expect([t.oldState, t.newState]).toEqual(["closed", "open"]);
    const c = new CloseEvent("close", { wasClean: true, code: 1000, reason: "bye" });
    expect([c.wasClean, c.code, c.reason]).toEqual([true, 1000, "bye"]);
  });
});
