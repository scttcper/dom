/**
 * Event init dictionaries: conversion order, defaults and the errors the constructors throw.
 *
 * Specs:
 *   WebIDL — https://webidl.spec.whatwg.org/#es-dictionary (members are converted base
 *     dictionary first, each dictionary's members in lexicographic order; a getter on the
 *     ECMAScript object observes the order), https://webidl.spec.whatwg.org/#es-overloads
 *     (arguments are converted left to right: the type string before the dictionary)
 *   UI Events — https://w3c.github.io/uievents/#dictdef-uieventinit,
 *     https://w3c.github.io/uievents/#dictdef-eventmodifierinit,
 *     https://w3c.github.io/uievents/#dictdef-mouseeventinit,
 *     https://w3c.github.io/uievents/#dictdef-keyboardeventinit,
 *     https://w3c.github.io/uievents/#dictdef-inputeventinit
 *   Pointer Events — https://w3c.github.io/pointerevents/#dom-pointereventinit,
 *     https://w3c.github.io/pointerevents/#dom-pointerevent-getcoalescedevents
 *
 * Differential against jsdom (webidl2js-generated converters are the oracle for the order).
 * The constructors read `new.target.name` only to build an error message, so the messages are
 * pinned for subclasses too.
 */
import { describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import * as ctrlDom from "@ctrl/dom";
import { setup } from "./helpers.ts";

type Ctor = new (type: string, init?: object) => object;
type Win = Record<string, Ctor>;

const ours = setup().window as unknown as Win;
const theirs = new JSDOM("").window as unknown as Win;

/** The member names a constructor reads from its init dictionary, in order (repeats collapsed). */
function readOrder(Ctor: Ctor): string[] {
  const log: string[] = [];
  const dict = new Proxy(
    {},
    {
      get(_t, key) {
        if (typeof key === "string" && key !== log.at(-1)) log.push(key);
        return undefined;
      },
    },
  );
  new Ctor("type", dict);
  return log;
}

function thrownBy(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "(no throw)";
}

describe("dictionary member order (differential vs jsdom) — https://webidl.spec.whatwg.org/#es-dictionary", () => {
  // jsdom lacks DragEvent and ClipboardEvent; InputEvent.dataTransfer is a spec addition
  // (docs/deviations.md), read in its lexicographic place.
  const cases: [name: string, extras?: string[]][] = [
    ["Event"],
    ["CustomEvent"],
    ["UIEvent"],
    ["FocusEvent"],
    ["MouseEvent"],
    ["PointerEvent"],
    ["WheelEvent"],
    ["KeyboardEvent"],
    ["InputEvent", ["dataTransfer"]],
    ["CompositionEvent"],
    ["TouchEvent"],
  ];
  for (const [name, extras = []] of cases) {
    test(`${name}: base dictionary first, then each dictionary's members in lexicographic order`, () => {
      const expected = readOrder(theirs[name]);
      expect(expected.length).toBeGreaterThan(2);
      expect(readOrder(ours[name]).filter((k) => !extras.includes(k))).toEqual(expected);
    });
  }

  test("a throwing getter stops the conversion at its member, in that order", () => {
    const throwing = (members: string[]) => {
      const dict: Record<string, unknown> = {};
      for (const m of members) {
        Object.defineProperty(dict, m, {
          get() {
            throw new Error(m);
          },
          enumerable: true,
        });
      }
      return dict;
    };
    // EventModifierInit's members before MouseEventInit's / KeyboardEventInit's; UIEventInit's
    // `detail` before `view`; PointerEventInit alphabetically.
    for (const [name, members] of [
      ["MouseEvent", ["clientX", "altKey"]],
      ["KeyboardEvent", ["key", "charCode"]],
      ["PointerEvent", ["pointerId", "altitudeAngle"]],
      ["UIEvent", ["view", "detail"]],
      ["TouchEvent", ["touches", "changedTouches"]],
    ] as const) {
      const expected = thrownBy(() => new theirs[name]("x", throwing([...members])));
      expect(expected).toBe(members[1]);
      expect(thrownBy(() => new ours[name]("x", throwing([...members])))).toBe(expected);
    }
  });

  test("the type is converted before the dictionary is validated — https://webidl.spec.whatwg.org/#es-overloads", () => {
    const sym = Symbol("t") as unknown as string;
    // jsdom: "parameter 1 is a symbol, which cannot be converted to a string." (not the
    // dictionary error) — ours words it like V8 but fails on the same argument.
    const notADict = 5 as unknown as object;
    expect(thrownBy(() => new theirs.UIEvent(sym, notADict))).toMatch(/parameter 1/);
    expect(thrownBy(() => new ours.UIEvent(sym, notADict))).toMatch(/Symbol/);
    expect(thrownBy(() => new ours.UIEvent(sym, notADict))).not.toMatch(/Init/);
  });
});

describe("constructor errors name the constructed interface — https://webidl.spec.whatwg.org/#dfn-create-exception", () => {
  test("missing argument and non-object dictionary (differential vs jsdom for the former)", () => {
    for (const name of ["UIEvent", "MouseEvent", "PointerEvent", "KeyboardEvent", "InputEvent", "CustomEvent"]) {
      const expected = thrownBy(() => new (theirs[name] as unknown as new () => object)());
      expect(expected).toBe(`Failed to construct '${name}': 1 argument required, but only 0 present.`);
      expect(thrownBy(() => new (ours[name] as unknown as new () => object)())).toBe(expected);
      expect(thrownBy(() => new ours[name]("x", 5 as never))).toBe(
        `Failed to construct '${name}': The provided value is not of type '${name}Init'.`,
      );
    }
  });

  test("member conversion failures carry the member and the interface (lazily read from new.target)", () => {
    expect(thrownBy(() => new ours.PointerEvent("x", { clientX: NaN }))).toBe(
      "Failed to construct 'PointerEvent': member clientX is not a finite floating-point value.",
    );
    expect(thrownBy(() => new ours.MouseEvent("x", { screenY: "abc" as never }))).toBe(
      "Failed to construct 'MouseEvent': member screenY is not a finite floating-point value.",
    );
    expect(thrownBy(() => new ours.WheelEvent("x", { deltaZ: Infinity }))).toBe(
      "Failed to construct 'WheelEvent': member deltaZ is not a finite floating-point value.",
    );
    expect(thrownBy(() => new ours.PointerEvent("x", { pressure: 1e40 }))).toBe(
      "Failed to construct 'PointerEvent': member pressure is outside the range of a float.",
    );
    expect(thrownBy(() => new ours.PointerEvent("x", { width: NaN }))).toBe(
      "Failed to construct 'PointerEvent': member width is not a finite floating-point value.",
    );
    expect(thrownBy(() => new ours.ProgressEvent("x", { loaded: NaN }))).toBe(
      "Failed to construct 'ProgressEvent': member loaded is not a finite floating-point value.",
    );
    for (const name of ["UIEvent", "FocusEvent", "MouseEvent", "PointerEvent", "KeyboardEvent", "WheelEvent"]) {
      const expected = thrownBy(() => new theirs[name]("x", { view: 1 }));
      expect(expected).toBe(`Failed to construct '${name}': member view is not of type Window.`);
      expect(thrownBy(() => new ours[name]("x", { view: {} }))).toBe(expected);
    }
  });

  test("a subclass constructed with new reports its own name", () => {
    class Sub extends ctrlDom.PointerEvent {}
    expect(thrownBy(() => new (Sub as unknown as new () => object)())).toBe(
      "Failed to construct 'Sub': 1 argument required, but only 0 present.",
    );
    expect(thrownBy(() => new Sub("x", { clientX: NaN }))).toBe(
      "Failed to construct 'Sub': member clientX is not a finite floating-point value.",
    );
    expect(thrownBy(() => new Sub("x", { view: {} as never }))).toBe(
      "Failed to construct 'Sub': member view is not of type Window.",
    );
  });
});

describe("defaults without a dictionary — https://w3c.github.io/pointerevents/#dom-pointereventinit", () => {
  test.each([undefined, null])("PointerEvent with %s init has the dictionary defaults", (init) => {
    const e = new ctrlDom.PointerEvent("pointerdown", init);
    expect([e.pointerId, e.width, e.height, e.pressure, e.tangentialPressure]).toEqual([0, 1, 1, 0, 0]);
    expect([e.tiltX, e.tiltY, e.twist, e.altitudeAngle, e.azimuthAngle]).toEqual([0, 0, 0, Math.PI / 2, 0]);
    expect([e.pointerType, e.isPrimary, e.persistentDeviceId]).toEqual(["", false, 0]);
    expect([e.clientX, e.screenX, e.button, e.buttons, e.detail, e.view, e.relatedTarget]).toEqual([
      0,
      0,
      0,
      0,
      0,
      null,
      null,
    ]);
    expect([e.ctrlKey, e.shiftKey, e.altKey, e.metaKey, e.getModifierState("CapsLock")]).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  test("getCoalescedEvents/getPredictedEvents return a fresh array each call, never a shared one", () => {
    const a = new ctrlDom.PointerEvent("pointermove");
    const b = new ctrlDom.PointerEvent("pointermove", null);
    const first = a.getCoalescedEvents();
    first.push(b);
    expect(a.getCoalescedEvents()).toEqual([]);
    expect(b.getCoalescedEvents()).toEqual([]);
    expect(a.getCoalescedEvents()).not.toBe(b.getCoalescedEvents());
    expect(a.getPredictedEvents()).not.toBe(a.getPredictedEvents());
    expect(Object.isFrozen(a.getPredictedEvents())).toBe(false);
  });

  test("KeyboardEvent, MouseEvent, InputEvent and UIEvent defaults with a null dictionary", () => {
    const k = new ctrlDom.KeyboardEvent("keydown", null);
    expect([k.key, k.code, k.location, k.repeat, k.isComposing, k.charCode, k.keyCode]).toEqual([
      "",
      "",
      0,
      false,
      false,
      0,
      0,
    ]);
    const m = new ctrlDom.MouseEvent("click", null);
    expect([m.clientX, m.clientY, m.movementX, m.button, m.buttons, m.relatedTarget]).toEqual([0, 0, 0, 0, 0, null]);
    const i = new ctrlDom.InputEvent("input", null);
    expect([i.data, i.inputType, i.isComposing, i.dataTransfer]).toEqual([null, "", false, null]);
    const u = new ctrlDom.UIEvent("resize", null);
    expect([u.view, u.detail, u.which]).toEqual([null, 0, 0]);
  });
});
