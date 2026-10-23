/**
 * Downstream repro (Radix Primitives: 4 `form.test.tsx` failures in both rtd modes, "given
 * components used outside `Form.Field` (explicit wiring)": `Form.Message` never shows,
 * `aria-describedby` never set, `Form.ValidityState` renders nothing).
 *
 * Radix copies native validity with `for (const key in control.validity)` (form.tsx
 * `validityStateToObject` / `hasBuiltInError`). WebIDL attributes are enumerable accessors on the
 * interface prototype, so for…in yields the 11 ValidityState attributes. On @rtd/dom the
 * accessors are non-enumerable class getters and the instance has an enumerable own `_el` field,
 * so for…in yields only `_el`: `hasBuiltInError` sees `validity._el` (the element, truthy) as a
 * built-in error and the copied validity has no `valueMissing`.
 *
 * The same shape (enumerable `_`-prefixed own fields, non-enumerable prototype accessors) shows
 * up on other wrappers too (Element `_impl`/`_listeners`…, Event `_s`, Range `_sc`…, DOMRect `_x`…);
 * see TRIAGE.md. Only ValidityState breaks a Radix test today.
 *
 * Spec: https://webidl.spec.whatwg.org/#es-attributes ([[Enumerable]]: true)
 *       https://html.spec.whatwg.org/#validitystate
 * Owner: html-forms (ValidityState); the general enumerability convention is dom-core's call.
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

const ATTRIBUTES = [
  "valueMissing",
  "typeMismatch",
  "patternMismatch",
  "tooLong",
  "tooShort",
  "rangeUnderflow",
  "rangeOverflow",
  "stepMismatch",
  "badInput",
  "customError",
  "valid",
];

differential("for…in over ValidityState enumerates its WebIDL attributes", (make) => {
  test("for…in yields the 11 attributes and no internal fields", () => {
    const { document } = make();
    const input = document.createElement("input");
    input.required = true;
    document.body.append(input);
    const keys: string[] = [];
    for (const key in input.validity) keys.push(key);
    expect(keys.sort()).toEqual([...ATTRIBUTES].sort());
  });

  test("Radix's validityStateToObject copy keeps valueMissing", () => {
    const { document } = make();
    const input = document.createElement("input");
    input.required = true;
    document.body.append(input);
    const copy: Record<string, unknown> = {};
    for (const key in input.validity) copy[key] = input.validity[key];
    expect(copy).toMatchObject({ valueMissing: true, valid: false });
  });
});
