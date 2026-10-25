/**
 * Constraint validation and form-state pseudo-classes.
 *
 * Spec: HTML Standard §4.10.20 "Constraints"
 *   https://html.spec.whatwg.org/#constraints
 *   ValidityState          https://html.spec.whatwg.org/#validitystate
 *   barred                 https://html.spec.whatwg.org/#barred-from-constraint-validation
 *   setCustomValidity      https://html.spec.whatwg.org/#dom-cva-setcustomvalidity
 *   pattern                https://html.spec.whatwg.org/#attr-input-pattern
 *   state predicates       https://html.spec.whatwg.org/#pseudo-classes
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@ctrl/dom";
import * as state from "../../../src/html/forms/state.ts";
import { setUIValue, getUIValue } from "../../../src/html/forms/ui.ts";
import { $impl } from "../../../src/keys.ts";

let document: Document;
// biome-ignore lint: untyped DOM surface in tests
const $ = (id: string): any => document.getElementById(id);

// Browser-like messages are opt-in (`validationMessages: "browser"`); the default is jsdom's text.
beforeEach(() => {
  document = createWindow({ validationMessages: "browser" }).document;
});

// biome-ignore lint: test helper
function input(html: string): any {
  document.body!.innerHTML = html;
  return document.body!.firstElementChild;
}

describe("ValidityState — https://html.spec.whatwg.org/#validitystate", () => {
  test("valueMissing for required text, checkbox, radio group, file", () => {
    expect(input("<input required>").validity.valueMissing).toBe(true);
    expect(input("<input required value=x>").validity.valueMissing).toBe(false);
    expect(input("<input type=checkbox required>").validity.valueMissing).toBe(true);
    document.body!.innerHTML = "<input type=radio name=r id=a required><input type=radio name=r id=b>";
    expect($("b").validity.valueMissing).toBe(true);
    $("b").checked = true;
    expect($("a").validity.valueMissing).toBe(false);
    expect(input("<input type=file required>").validity.valueMissing).toBe(true);
  });

  test("readonly and disabled controls are barred: willValidate false, checkValidity true", () => {
    const el = input("<input required readonly>");
    expect(el.willValidate).toBe(false);
    expect(el.checkValidity()).toBe(true);
    expect(el.validationMessage).toBe("");
    expect(input("<input type=hidden required>").willValidate).toBe(false);
    expect(input("<button type=button>").willValidate).toBe(false);
    expect(input("<fieldset>").willValidate).toBe(false);
  });

  test("typeMismatch for email and url", () => {
    const e = input("<input type=email value=nope>");
    expect(e.validity.typeMismatch).toBe(true);
    expect(e.validationMessage).toBe("Please include an '@' in the email address. 'nope' is missing an '@'.");
    expect(input("<input type=url value=http://x.test/>").validity.typeMismatch).toBe(false);
    expect(input("<input type=url value=x>").validity.typeMismatch).toBe(true);
  });

  test("patternMismatch anchors the pattern and compiles it with the v flag; invalid patterns are ignored", () => {
    expect(input("<input pattern='[a-z]+' value=abc>").validity.patternMismatch).toBe(false);
    expect(input("<input pattern='[a-z]+' value=abc1>").validity.patternMismatch).toBe(true);
    expect(input("<input pattern='a|b' value=ab>").validity.patternMismatch).toBe(true);
    expect(input("<input pattern='(' value=x>").validity.valid).toBe(true);
  });

  test("tooLong/tooShort apply only after a user edit", () => {
    const el = input("<input maxlength=2 minlength=2>");
    el.value = "abc";
    expect(el.validity.tooLong).toBe(false);
    setUIValue(el, "abc");
    expect(el.validity.tooLong).toBe(true);
    expect(el.validationMessage).toBe("Please shorten this text to 2 characters or less (you are currently using 3 characters).");
    setUIValue(el, "a");
    expect(el.validity.tooShort).toBe(true);
  });

  test("rangeUnderflow/Overflow and stepMismatch", () => {
    const el = input("<input type=number min=1 max=10 step=2>");
    el.value = "0";
    expect(el.validity.rangeUnderflow).toBe(true);
    expect(el.validationMessage).toBe("Value must be greater than or equal to 1.");
    el.value = "11";
    expect(el.validity.rangeOverflow).toBe(true);
    el.value = "4";
    expect(el.validity.stepMismatch).toBe(true);
    expect(el.validationMessage).toBe("Please enter a valid value. The two nearest valid values are 3 and 5.");
  });

  test("badInput when the user types something a number field cannot represent", () => {
    const el = input("<input type=number>");
    setUIValue(el, "1e");
    expect(el.value).toBe("");
    expect(getUIValue(el)).toBe("1e");
    expect(el.validity.badInput).toBe(true);
    el.value = "2";
    expect(el.validity.badInput).toBe(false);
    expect(getUIValue(el)).toBe("2");
  });

  test("by default every built-in failure reads jsdom's generic message (drop-in compatibility)", () => {
    const doc = createWindow().document;
    doc.body!.innerHTML = "<input id=a required><input id=b type=email value=x><input id=c type=number min=5 value=1>";
    const msgs = ["a", "b", "c"].map((id) => (doc.getElementById(id) as any).validationMessage);
    expect(msgs).toEqual(["Constraints not satisfied", "Constraints not satisfied", "Constraints not satisfied"]);
    const el = doc.getElementById("a") as any;
    el.setCustomValidity("mine");
    expect(el.validationMessage).toBe("mine");
  });

  test("the custom message takes precedence over built-in messages when customError is set", () => {
    const el = input("<input type=email value=nope>");
    el.setCustomValidity("custom error");
    expect([el.validity.typeMismatch, el.validity.customError, el.validationMessage]).toEqual([true, true, "custom error"]);
  });

  test("setCustomValidity sets customError and the message (newlines normalized)", () => {
    const el = input("<input>");
    el.setCustomValidity("bad\r\nthing");
    expect(el.validity.customError).toBe(true);
    expect(el.validity.valid).toBe(false);
    expect(el.validationMessage).toBe("bad\nthing");
    el.setCustomValidity("");
    expect(el.validity.valid).toBe(true);
  });

  test("checkValidity fires a cancelable, non-bubbling invalid event", () => {
    const el = input("<input required>");
    const seen: [boolean, boolean][] = [];
    el.addEventListener("invalid", (e: any) => seen.push([e.bubbles, e.cancelable]));
    expect(el.checkValidity()).toBe(false);
    expect(el.reportValidity()).toBe(false);
    expect(seen).toEqual([[false, true], [false, true]]);
  });

  test("validity is a live ValidityState", () => {
    const el = input("<input required>");
    const v = el.validity;
    expect(Object.prototype.toString.call(v)).toBe("[object ValidityState]");
    el.value = "x";
    expect(v.valid).toBe(true);
    expect(el.validity).toBe(v);
  });
});

describe("state predicates — https://html.spec.whatwg.org/#pseudo-classes", () => {
  test(":checked, :indeterminate, :default", () => {
    document.body!.innerHTML =
      "<input type=checkbox id=c checked><input type=radio name=g id=r><select><option id=o1>a</option><option id=o2 selected>b</option></select><progress id=p></progress>";
    expect(state.isChecked($("c")[$impl])).toBe(true);
    expect(state.isIndeterminate($("r")[$impl])).toBe(true);
    expect(state.isChecked($("o2")[$impl])).toBe(true);
    expect(state.isChecked($("o1")[$impl])).toBe(false);
    expect(state.isDefault($("o2")[$impl])).toBe(true);
    expect(state.isIndeterminate($("p")[$impl])).toBe(true);
    $("c").indeterminate = true;
    expect(state.isIndeterminate($("c")[$impl])).toBe(true);
  });

  test(":valid / :invalid exclude barred elements; forms and fieldsets reflect their controls", () => {
    document.body!.innerHTML = "<form id=f><fieldset id=fs><input id=i required></fieldset><input id=d required disabled></form>";
    expect(state.isInvalid($("i")[$impl])).toBe(true);
    expect(state.isInvalid($("d")[$impl])).toBe(false);
    expect(state.isValid($("d")[$impl])).toBe(false);
    expect(state.isInvalid($("fs")[$impl])).toBe(true);
    expect(state.isInvalid($("f")[$impl])).toBe(true);
    $("i").value = "x";
    expect(state.isValid($("f")[$impl])).toBe(true);
  });

  test(":read-only / :read-write, :required / :optional, :placeholder-shown, :in-range", () => {
    document.body!.innerHTML =
      "<input id=a><input id=b readonly><input id=c type=checkbox><textarea id=t required placeholder=p></textarea><input type=number id=n min=1 value=0>";
    expect(state.isReadWrite($("a")[$impl])).toBe(true);
    expect(state.isReadOnly($("b")[$impl])).toBe(true);
    expect(state.isReadOnly($("c")[$impl])).toBe(true);
    expect(state.isRequired($("t")[$impl])).toBe(true);
    expect(state.isOptional($("a")[$impl])).toBe(true);
    expect(state.isPlaceholderShown($("t")[$impl])).toBe(true);
    expect(state.isOutOfRange($("n")[$impl])).toBe(true);
    $("n").value = "3";
    expect(state.isInRange($("n")[$impl])).toBe(true);
  });
});
