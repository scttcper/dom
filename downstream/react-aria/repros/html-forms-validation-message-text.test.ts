/**
 * Downstream repro (React Aria: 19 tests across RAC TextField, SearchField, NumberField,
 * ColorField, ComboBox, Select, RadioGroup, DateField, TimeField — "supports validation errors":
 * `expect(errorMessage).toHaveTextContent('Constraints not satisfied')`, received "Please fill
 * out this field." / "Please select one of these options.").
 *
 * React Aria renders the native `validationMessage` when no custom message is given. jsdom
 * (every version) returns the generic "Constraints not satisfied" for any failing constraint;
 * @ctrl/dom returns Chrome's per-constraint strings. Both are allowed by HTML (the text is UA
 * defined: https://html.spec.whatwg.org/#dom-cva-validationmessage), but tests written against
 * jsdom assert jsdom's string, and the difference is not listed in docs/deviations.md.
 *
 * Owner: html-forms (decide: jsdom's string for drop-in parity, or keep Chrome's and document it).
 */
import { describe, expect, test } from "vitest";
import { windows } from "./engines.ts";

describe.each(["jsdom", "ctrl-dom"] as const)("%s", (engine) => {
  test("validationMessage of an empty required input matches jsdom's 'Constraints not satisfied'", () => {
    const { document } = windows[engine]();
    const input = document.createElement("input");
    input.required = true;
    document.body.append(input);
    expect(input.validationMessage).toBe("Constraints not satisfied");
  });

  test("validationMessage of an unchecked required radio group matches jsdom", () => {
    const { document } = windows[engine]();
    document.body.innerHTML = `<form><input type="radio" name="r" required><input type="radio" name="r"></form>`;
    expect(document.querySelector("input")!.validationMessage).toBe("Constraints not satisfied");
  });
});
