/**
 * Object shape of Event instances: own properties, enumeration and pretty-format output.
 *
 * Specs:
 *   WebIDL — https://webidl.spec.whatwg.org/#es-attributes (attributes are enumerable prototype
 *     accessors), https://webidl.spec.whatwg.org/#es-operations (operations likewise),
 *     https://webidl.spec.whatwg.org/#LegacyUnforgeable (own accessor on every instance)
 *   DOM — https://dom.spec.whatwg.org/#dom-event-istrusted ([LegacyUnforgeable] isTrusted)
 *
 * Differential against jsdom (the oracle): an event's only own enumerable property is
 * `isTrusted`, so Jest/Vitest print `MouseEvent {"isTrusted": false}` in mock-call diffs and
 * snapshots, and `for...in` yields the IDL attributes and operations.
 *
 * Deviation (docs/deviations.md, Events): `isTrusted` is an own data property, not the
 * [LegacyUnforgeable] accessor, so WPT dom/events/Event-isTrusted.any.js (same getter on every
 * instance) is a known failure; its observable value is pinned below instead.
 */
import { describe, expect, test } from "vitest";
// Vitest's own serializer (pretty-format + default plugins), used for snapshots and
// `toHaveBeenCalledWith` / `toEqual` diff output.
import { stringify } from "vitest/internal/browser";
import { JSDOM } from "jsdom";
import * as ctrlDom from "@ctrl/dom";
import { setTrusted } from "@ctrl/dom/internal";
import { setup } from "./helpers.ts";

const vitestFormat = (v: unknown) => stringify(v);

type Win = Record<string, new (type: string, init?: object) => object>;

const cases: [string, object?][] = [
  ["Event", { bubbles: true }],
  ["CustomEvent", { detail: { a: 1 } }],
  ["UIEvent", { detail: 2 }],
  ["MouseEvent", { clientX: 5, button: 1, ctrlKey: true }],
  ["PointerEvent", { pointerId: 3, pointerType: "pen" }],
  ["KeyboardEvent", { key: "a", code: "KeyA", keyCode: 65 }],
  ["FocusEvent", {}],
  ["InputEvent", { data: "x", inputType: "insertText" }],
  ["WheelEvent", { deltaY: 3 }],
  ["CompositionEvent", { data: "あ" }],
  ["ErrorEvent", { message: "m" }],
  ["MessageEvent", { data: 1 }],
  ["ProgressEvent", { loaded: 1 }],
  ["HashChangeEvent", { newURL: "x" }],
  ["PopStateEvent", { state: 1 }],
  ["StorageEvent", { key: "k" }],
  ["SubmitEvent", {}],
  ["TouchEvent", {}],
];

// https://w3c.github.io/input-events/#interface-InputEvent, https://html.spec.whatwg.org/#the-popstateevent-interface,
// https://w3c.github.io/touch-events/#touchevent-interface (getModifierState)
const SPEC_ADDITIONS: Record<string, string[]> = {
  InputEvent: ["dataTransfer"],
  PopStateEvent: ["hasUAVisualTransition"],
  TouchEvent: ["getModifierState"],
};

function forInKeys(o: object): string[] {
  const keys: string[] = [];
  for (const k in o) keys.push(k);
  return keys.sort();
}

describe("Event object shape (differential vs jsdom) — https://webidl.spec.whatwg.org/#es-attributes", () => {
  const ours = setup().window as unknown as Win;
  const theirs = new JSDOM("").window as unknown as Win;

  for (const [name, init] of cases) {
    test(`${name}: own keys, pretty-format output and for...in keys match jsdom`, () => {
      const a = new ours[name]("type", init);
      const b = new theirs[name]("type", init);
      expect(Object.keys(a)).toEqual(Object.keys(b));
      expect(Object.keys(a)).toEqual(["isTrusted"]);
      expect(vitestFormat(a)).toBe(vitestFormat(b));
      // Members jsdom has not implemented yet but the current specs define are the only extras.
      expect(forInKeys(a)).toEqual([...forInKeys(b), ...(SPEC_ADDITIONS[name] ?? [])].sort());
    });
  }

  test("a mock-call snapshot of a dispatched click prints like jsdom", () => {
    const { document } = setup();
    const jsdomWindow = new JSDOM("").window;
    const jsdomCalls: unknown[] = [];
    const jel = jsdomWindow.document.createElement("button");
    jel.addEventListener("click", (e: unknown) => jsdomCalls.push(e));
    jel.dispatchEvent(new jsdomWindow.MouseEvent("click", { bubbles: true }));
    const el = document.createElement("button");
    const calls: unknown[] = [];
    el.addEventListener("click", (e) => calls.push(e));
    el.dispatchEvent(new ctrlDom.MouseEvent("click", { bubbles: true }));
    expect(vitestFormat(calls)).toBe(vitestFormat(jsdomCalls));
    expect(vitestFormat(calls)).toContain('MouseEvent {\n    "isTrusted": false,\n  }');
  });
});

describe("[LegacyUnforgeable] isTrusted — https://dom.spec.whatwg.org/#dom-event-istrusted", () => {
  test("isTrusted is an own enumerable property of every instance, with jsdom's value (a data property here)", () => {
    for (const Ctor of [ctrlDom.Event, ctrlDom.MouseEvent, ctrlDom.KeyboardEvent, ctrlDom.CustomEvent]) {
      const desc = Object.getOwnPropertyDescriptor(new Ctor("x"), "isTrusted");
      expect(desc).toMatchObject({ value: false, enumerable: true });
      expect(Object.hasOwn(Ctor.prototype, "isTrusted")).toBe(false);
    }
    const jsdomDesc = Object.getOwnPropertyDescriptor(new new JSDOM("").window.Event("x"), "isTrusted")!;
    expect([jsdomDesc.enumerable, jsdomDesc.get!.call(new new JSDOM("").window.Event("x"))]).toEqual([true, false]);
    expect(setup().document.createEvent("MouseEvent").isTrusted).toBe(false);
  });

  // https://dom.spec.whatwg.org/#concept-event-fire sets it; dispatchEvent step 2 and
  // https://dom.spec.whatwg.org/#concept-event-initialize step 4 reset it.
  test("true on events the user agent fires, false again once script re-dispatches or re-initializes them", () => {
    const { document } = setup();
    const checkbox = document.createElement("input") as ctrlDom.HTMLInputElement;
    checkbox.setAttribute("type", "checkbox");
    document.body!.appendChild(checkbox);
    const seen: [string, boolean][] = [];
    let changeEvent!: ctrlDom.Event;
    checkbox.addEventListener("click", (e) => seen.push([e.type, e.isTrusted]));
    checkbox.addEventListener("change", (e) => {
      seen.push([e.type, e.isTrusted]);
      changeEvent = e;
    });
    // click() dispatches an untrusted click; the input/change it causes are the UA's.
    checkbox.click();
    expect(seen).toEqual([
      ["click", false],
      ["change", true],
    ]);
    expect(changeEvent.isTrusted).toBe(true);
    expect(Object.keys(changeEvent)).toEqual(["isTrusted"]);
    expect(vitestFormat(changeEvent)).toBe('Event {\n  "isTrusted": true,\n}');
    seen.length = 0;
    checkbox.dispatchEvent(changeEvent);
    expect(seen).toEqual([["change", false]]);
    expect(changeEvent.isTrusted).toBe(false);

    const trusted = new ctrlDom.Event("x");
    setTrusted(trusted);
    expect(trusted.isTrusted).toBe(true);
    trusted.initEvent("y");
    expect([trusted.type, trusted.isTrusted]).toEqual(["y", false]);
  });

  test("DataTransfer has no own enumerable internals", () => {
    const dt = new ctrlDom.DataTransfer();
    dt.setData("text/plain", "x");
    expect(Object.keys(dt)).toEqual([]);
    expect(Object.keys(dt.items)).toEqual(["0"]);
    expect(forInKeys(dt)).toEqual(
      expect.arrayContaining(["dropEffect", "effectAllowed", "items", "types", "getData", "setData", "files"]),
    );
  });
});
