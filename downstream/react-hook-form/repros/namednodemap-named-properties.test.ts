/**
 * Downstream repro (react-hook-form: `src/__tests__/useForm/register.test.tsx` › "register
 * disabled not throw errors with disabled input" and "work correctly with toggle disabled
 * attribute and validation", both ctrl-dom modes). Fixed in @ctrl/dom (NamedNodeMap named properties);
 * kept as a differential check.
 *
 * react-hook-form reads a single checkbox's value in `getCheckboxValue` (src/logic):
 *
 *   if (!option.attributes || !('value' in option.attributes)) return { value: true, isValid: true };
 *   return { value: option.value, isValid: true };
 *
 * `'value' in el.attributes` is a WebIDL named property ([LegacyUnenumerableNamedProperties] on
 * NamedNodeMap): true in browsers and jsdom when the element has a `value` attribute. @ctrl/dom
 * had no named properties on NamedNodeMap (a documented Proxy-free deviation), so a checked
 * `<input type=checkbox value="test">` produced `true`, the form state was `{ test: true }`
 * instead of `{ test: "test" }`, and the validation/JSON assertions failed.
 *
 * Spec: https://dom.spec.whatwg.org/#interface-namednodemap
 *       https://dom.spec.whatwg.org/#ref-for-dfn-supported-property-names
 *       https://webidl.spec.whatwg.org/#LegacyUnenumerableNamedProperties
 * Owner: dom-core (packages/dom/src/collections/NamedNodeMap.ts).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

/** react-hook-form's getCheckboxValue for a single checkbox, verbatim logic. */
function getCheckboxValue(option: any): { value: unknown; isValid: boolean } {
  if (!option || !option.checked || option.disabled) return { value: false, isValid: false };
  if (!option.attributes || !("value" in option.attributes)) return { value: true, isValid: true };
  return option.value === undefined || option.value === ""
    ? { value: true, isValid: true }
    : { value: option.value, isValid: true };
}

differential("NamedNodeMap named properties (react-hook-form getCheckboxValue)", (make) => {
  test("a checked checkbox with a value attribute yields its value", () => {
    const { document } = make();
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("value", "test");
    input.checked = true;
    expect("value" in input.attributes).toBe(true);
    expect(input.attributes.value.value).toBe("test");
    expect(getCheckboxValue(input)).toEqual({ value: "test", isValid: true });
  });

  test("without a value attribute it yields true; named properties are not enumerable", () => {
    const { document } = make();
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    expect("value" in input.attributes).toBe(false);
    expect(getCheckboxValue(input)).toEqual({ value: true, isValid: true });
    input.setAttribute("value", "x");
    // (jsdom also lists own index keys here; @ctrl/dom's indices are prototype accessors, see docs/deviations.md.)
    expect(Object.keys(input.attributes)).not.toContain("value");
  });
});
