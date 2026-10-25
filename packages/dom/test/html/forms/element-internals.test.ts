/**
 * ElementInternals: validity, validation messages, barring and custom states of
 * form-associated custom elements.
 *
 * Spec: HTML Standard §4.13.7 "Custom element default semantics / ElementInternals"
 *   - the ElementInternals interface:     https://html.spec.whatwg.org/#the-elementinternals-interface
 *   - attachInternals():                  https://html.spec.whatwg.org/#dom-attachinternals
 *   - setValidity():                      https://html.spec.whatwg.org/#dom-elementinternals-setvalidity
 *   - willValidate / validity / validationMessage / checkValidity:
 *                                         https://html.spec.whatwg.org/#dom-elementinternals-willvalidate
 *                                         https://html.spec.whatwg.org/#dom-elementinternals-checkvalidity
 *   - barred from constraint validation:  https://html.spec.whatwg.org/#barred-from-constraint-validation
 *   - form-associated custom elements:    https://html.spec.whatwg.org/#form-associated-custom-element
 *   - CustomStateSet and :state():        https://html.spec.whatwg.org/#customstateset
 *                                         https://html.spec.whatwg.org/#selector-custom
 *
 * jsdom has no setValidity/setFormValue/states, so there is no oracle. Basic FACE wiring is in
 * face-parser-selectedcontent.test.ts; design-system inputs built as FACEs (Shoelace, Material
 * Web) rely on these details.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

let window: any;
let document: any;
let internals: any;
let el: any;

beforeEach(() => {
  window = createWindow();
  document = window.document;
  window.customElements.define(
    "x-field",
    class extends window.HTMLElement {
      static formAssociated = true;
      constructor() {
        super();
        internals = this.attachInternals();
      }
    },
  );
  document.body.innerHTML = "<form><x-field name=f><span id=inner></span></x-field></form>";
  el = document.querySelector("x-field");
});

function errorName(fn: () => void): string {
  try {
    fn();
    return "none";
  } catch (e) {
    return (e as Error).name;
  }
}

describe("attachInternals() — https://html.spec.whatwg.org/#dom-attachinternals", () => {
  test("a second call throws NotSupportedError; built-in and undefined elements cannot attach", () => {
    expect(errorName(() => el.attachInternals())).toBe("NotSupportedError");
    expect(errorName(() => document.createElement("div").attachInternals())).toBe("NotSupportedError");
    expect(errorName(() => document.createElement("x-undefined").attachInternals())).toBe("NotSupportedError");
  });

  test('disabledFeatures containing "internals" makes attachInternals throw', () => {
    window.customElements.define(
      "x-closed",
      class extends window.HTMLElement {
        static disabledFeatures = ["internals"];
      },
    );
    expect(errorName(() => document.createElement("x-closed").attachInternals())).toBe("NotSupportedError");
  });
});

describe("setValidity() — https://html.spec.whatwg.org/#dom-elementinternals-setvalidity", () => {
  test("any true flag requires a non-empty message (TypeError)", () => {
    expect(errorName(() => internals.setValidity({ valueMissing: true }))).toBe("TypeError");
    expect(errorName(() => internals.setValidity({ valueMissing: true }, ""))).toBe("TypeError");
    expect(errorName(() => internals.setValidity({ valueMissing: false }))).toBe("none");
  });

  test("the anchor must be a shadow-including inclusive descendant (NotFoundError)", () => {
    expect(errorName(() => internals.setValidity({ customError: true }, "m", document.body))).toBe("NotFoundError");
    expect(errorName(() => internals.setValidity({ customError: true }, "m", document.getElementById("inner")))).toBe(
      "none",
    );
    const root = el.attachShadow({ mode: "open" });
    const shadowInput = root.appendChild(document.createElement("input"));
    expect(errorName(() => internals.setValidity({ customError: true }, "m", shadowInput))).toBe("none");
  });

  test("each flag maps onto ValidityState; valid is true only when every flag is false", () => {
    internals.setValidity({ tooShort: true, patternMismatch: true }, "bad");
    const v = internals.validity;
    expect([v.tooShort, v.patternMismatch, v.valueMissing, v.valid]).toEqual([true, true, false, false]);
    internals.setValidity({});
    expect(v.valid).toBe(true);
    // The same live object.
    expect(internals.validity).toBe(v);
  });

  test("the message is stored with newlines normalized; clearing all flags clears it", () => {
    internals.setValidity({ customError: true }, "line1\r\nline2\rline3");
    expect(internals.validationMessage).toBe("line1\nline2\nline3");
    internals.setValidity({}, "ignored");
    expect(internals.validationMessage).toBe("");
  });

  test("the element matches :invalid, its form matches :invalid, checkValidity() fires a cancelable invalid event", () => {
    internals.setValidity({ valueMissing: true }, "required");
    expect(el.matches(":invalid")).toBe(true);
    expect(document.querySelector("form").matches(":invalid")).toBe(true);
    const events: any[] = [];
    el.addEventListener("invalid", (e: any) => events.push(e));
    expect(internals.checkValidity()).toBe(false);
    expect(internals.reportValidity()).toBe(false);
    expect(events.map((e) => [e.bubbles, e.cancelable])).toEqual([
      [false, true],
      [false, true],
    ]);
    expect(document.querySelector("form").checkValidity()).toBe(false);
  });
});

describe("barred from constraint validation — https://html.spec.whatwg.org/#barred-from-constraint-validation", () => {
  test("a disabled FACE, a readonly FACE and a FACE inside a datalist are barred: willValidate false, empty message, valid checkValidity", () => {
    internals.setValidity({ customError: true }, "nope");
    expect(internals.willValidate).toBe(true);
    for (const make of [
      () => el.setAttribute("disabled", ""),
      () => el.setAttribute("readonly", ""),
      () => document.body.appendChild(document.createElement("datalist")).appendChild(el),
    ]) {
      make();
      expect(internals.willValidate).toBe(false);
      expect(internals.validationMessage).toBe("");
      expect(internals.checkValidity()).toBe(true);
      expect(el.matches(":invalid")).toBe(false);
      el.removeAttribute("disabled");
      el.removeAttribute("readonly");
      document.querySelector("form").appendChild(el);
    }
    expect(internals.willValidate).toBe(true);
  });

  test("a disabled fieldset bars descendant FACEs", () => {
    internals.setValidity({ customError: true }, "nope");
    const fieldset = document.createElement("fieldset");
    document.querySelector("form").appendChild(fieldset).appendChild(el);
    fieldset.disabled = true;
    expect(internals.willValidate).toBe(false);
    expect(el.matches(":disabled")).toBe(true);
  });
});

describe("CustomStateSet — https://html.spec.whatwg.org/#customstateset", () => {
  test("states is a setlike; :state(x) matches while x is in the set", () => {
    const states = internals.states;
    expect(internals.states).toBe(states);
    states.add("checked");
    expect(states.has("checked")).toBe(true);
    expect(el.matches(":state(checked)")).toBe(true);
    expect(document.querySelector(":state(checked)")).toBe(el);
    expect([...states]).toEqual(["checked"]);
    states.delete("checked");
    expect(el.matches(":state(checked)")).toBe(false);
    states.add("a");
    states.add("b");
    expect(states.size).toBe(2);
    states.clear();
    expect(states.size).toBe(0);
  });

  test("states is available on custom elements that are not form-associated", () => {
    window.customElements.define(
      "x-plain",
      class extends window.HTMLElement {
        constructor() {
          super();
          (this as any).i = this.attachInternals();
        }
      },
    );
    const plain = document.body.appendChild(document.createElement("x-plain"));
    plain.i.states.add("open");
    expect(plain.matches(":state(open)")).toBe(true);
    // ...but the form-associated members throw NotSupportedError.
    expect(errorName(() => plain.i.setValidity({}))).toBe("NotSupportedError");
    expect(errorName(() => plain.i.willValidate)).toBe("NotSupportedError");
  });
});
