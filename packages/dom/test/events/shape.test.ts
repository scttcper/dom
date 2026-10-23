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
 * Related WPT: dom/events/Event-isTrusted.any.js.
 */
import { describe, expect, test } from "vitest";
// Vitest's own serializer (pretty-format + default plugins), used for snapshots and
// `toHaveBeenCalledWith` / `toEqual` diff output.
import { stringify } from "vitest/internal/browser";
import { JSDOM } from "jsdom";
import * as rtd from "@rtd/dom";
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
    el.dispatchEvent(new rtd.MouseEvent("click", { bubbles: true }));
    expect(vitestFormat(calls)).toBe(vitestFormat(jsdomCalls));
    expect(vitestFormat(calls)).toContain('MouseEvent {\n    "isTrusted": false,\n  }');
  });
});

describe("[LegacyUnforgeable] isTrusted — https://dom.spec.whatwg.org/#dom-event-istrusted", () => {
  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-isTrusted.any.js
  test("isTrusted is an own accessor with the same getter on every instance", () => {
    const desc1 = Object.getOwnPropertyDescriptor(new rtd.Event("x"), "isTrusted");
    expect(desc1).not.toBeUndefined();
    expect(typeof desc1!.get).toBe("function");
    const desc2 = Object.getOwnPropertyDescriptor(new rtd.MouseEvent("x"), "isTrusted");
    expect(desc2!.get).toBe(desc1!.get);
    expect(desc1!.enumerable).toBe(true);
    expect(desc1!.configurable).toBe(false);
  });

  test("DataTransfer has no own enumerable internals", () => {
    const dt = new rtd.DataTransfer();
    dt.setData("text/plain", "x");
    expect(Object.keys(dt)).toEqual([]);
    expect(Object.keys(dt.items)).toEqual(["0"]);
    expect(forInKeys(dt)).toEqual(expect.arrayContaining(["dropEffect", "effectAllowed", "items", "types", "getData", "setData", "files"]));
  });
});
