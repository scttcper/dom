/**
 * Form-associated custom elements, parser form association and <selectedcontent>.
 *
 * Spec: HTML Standard
 *   form-associated custom elements  https://html.spec.whatwg.org/#form-associated-custom-elements
 *   ElementInternals                 https://html.spec.whatwg.org/#the-elementinternals-interface
 *   parser form association          https://html.spec.whatwg.org/#association-of-controls-and-forms
 *                                    https://html.spec.whatwg.org/#create-an-element-for-the-token
 *   selectedcontent                  https://html.spec.whatwg.org/#the-selectedcontent-element
 *                                    https://html.spec.whatwg.org/#update-a-select's-selectedcontent
 *
 * Several FACE cases follow WPT custom-elements/form-associated/{ElementInternals-setFormValue,
 * ElementInternals-validation,form-associated-callback}.html.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

// biome-ignore lint: untyped DOM surface in tests
let window: any;
// biome-ignore lint: untyped DOM surface in tests
let document: any;
// biome-ignore lint: untyped DOM surface in tests
const $ = (id: string): any => document.getElementById(id);

let counter = 0;
// biome-ignore lint: test helper
function defineFace(log: string[] = []): { name: string; internals: () => any } {
  const name = `x-face-${++counter}`;
  // biome-ignore lint: test helper
  let last: any = null;
  window.customElements.define(
    name,
    class extends window.HTMLElement {
      static formAssociated = true;
      // biome-ignore lint: test helper
      i: any;
      constructor() {
        super();
        this.i = this.attachInternals();
        last = this.i;
      }
      formAssociatedCallback(form: { id: string } | null) {
        log.push(`associated:${form?.id ?? null}`);
      }
      formResetCallback() {
        log.push("reset");
      }
      formDisabledCallback(disabled: boolean) {
        log.push(`disabled:${disabled}`);
      }
    },
  );
  return { name, internals: () => last };
}

beforeEach(() => {
  window = createWindow();
  document = window.document;
});

describe("form-associated custom elements — https://html.spec.whatwg.org/#form-associated-custom-elements", () => {
  test("form owner, labels, form.elements membership", () => {
    const { name } = defineFace();
    document.body.innerHTML = `<form id=f><label id=l>L <${name} id=c name=n></${name}></label></form>`;
    const c = $("c");
    expect(c.i.form).toBe($("f"));
    expect([...c.i.labels]).toEqual([$("l")]);
    expect($("l").control).toBe(c);
    document.body.insertAdjacentHTML("beforeend", "<label id=l2 for=c>other</label>");
    expect($("l2").control).toBe(c);
    expect(c.i.labels.length).toBe(2);
    expect([...$("f").elements]).toEqual([c]);
  });

  test("setFormValue contributes to FormData (string value, FormData value, null)", () => {
    const { name } = defineFace();
    document.body.innerHTML = `<form id=f><${name} id=a name=a></${name}><${name} id=b></${name}><${name} id=c name=c></${name}></form>`;
    $("a").i.setFormValue("1");
    const fd = new window.FormData();
    fd.append("x", "2");
    fd.append("y", "3");
    $("b").i.setFormValue(fd);
    $("c").i.setFormValue(null);
    expect([...new window.FormData($("f"))]).toEqual([
      ["a", "1"],
      ["x", "2"],
      ["y", "3"],
    ]);
  });

  test("setValidity drives validity, willValidate, checkValidity and :invalid; the form is invalid", () => {
    const { name } = defineFace();
    document.body.innerHTML = `<form id=f><${name} id=c></${name}></form>`;
    const i = $("c").i;
    expect(i.willValidate).toBe(true);
    expect(() => i.setValidity({ valueMissing: true })).toThrow(TypeError);
    i.setValidity({ valueMissing: true }, "required!");
    expect([i.validity.valueMissing, i.validity.valid, i.validationMessage]).toEqual([true, false, "required!"]);
    let invalid = 0;
    $("c").addEventListener("invalid", () => invalid++);
    expect(i.checkValidity()).toBe(false);
    expect($("f").checkValidity()).toBe(false);
    expect(invalid).toBe(2);
    expect($("c").matches(":invalid")).toBe(true);
    i.setValidity({});
    expect(i.validity.valid).toBe(true);
  });

  test("disabled FACEs (own attribute or fieldset) are barred and excluded from FormData", () => {
    const { name } = defineFace();
    document.body.innerHTML = `<form id=f><fieldset disabled><${name} id=c name=n></${name}></fieldset></form>`;
    $("c").i.setFormValue("v");
    expect($("c").i.willValidate).toBe(false);
    expect([...new window.FormData($("f"))]).toEqual([]);
  });

  test("formAssociatedCallback, formResetCallback and formDisabledCallback", () => {
    const log: string[] = [];
    const { name } = defineFace(log);
    document.body.innerHTML = "<form id=f></form><form id=g></form>";
    const el = document.createElement(name);
    $("f").appendChild(el);
    el.setAttribute("form", "g");
    el.setAttribute("disabled", "");
    $("g").reset();
    el.remove();
    expect(log).toEqual(["associated:f", "associated:g", "disabled:true", "reset", "associated:null"]);
  });

  test("ElementInternals form members throw NotSupportedError on non-form-associated custom elements", () => {
    const name = `x-plain-${++counter}`;
    // biome-ignore lint: test helper
    let internals: any;
    window.customElements.define(
      name,
      class extends window.HTMLElement {
        constructor() {
          super();
          internals = this.attachInternals();
        }
      },
    );
    document.createElement(name);
    expect(() => internals.form).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    expect(() => internals.setFormValue("x")).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
  });
});

describe("parser form association — https://html.spec.whatwg.org/#association-of-controls-and-forms", () => {
  test("misnested table markup and an unclosed form associate through the form element pointer", () => {
    window = createWindow({
      html: "<table><form id=f><tr><td><input id=i></td></tr></form></table><div><form id=g></div><input id=j>",
    });
    document = window.document;
    expect($("i").parentNode.localName).toBe("td");
    expect($("i").form).toBe($("f"));
    expect($("j").form).toBe($("g"));
    expect([...$("g").elements]).toEqual([$("j")]);
  });

  test("a form attribute wins; moving the element resets the association", () => {
    window = createWindow({ html: "<div><form id=g></div><input id=j><input id=k form=nope>" });
    document = window.document;
    expect($("k").form).toBeNull();
    $("j").setAttribute("form", "g");
    expect($("j").form).toBe($("g"));
    $("j").removeAttribute("form");
    expect($("j").form).toBeNull();
    window = createWindow({ html: "<div><form id=g></div><input id=j>" });
    document = window.document;
    document.body.appendChild($("j"));
    expect($("j").form).toBeNull();
  });

  test("removing the form ends the association even if it comes back", () => {
    window = createWindow({ html: "<div id=d><form id=g></div><input id=j>" });
    document = window.document;
    const g = $("g");
    g.remove();
    expect($("j").form).toBeNull();
    $("d").appendChild(g);
    expect($("j").form).toBeNull();
  });

  test("innerHTML (fragment parsing) never uses the form element pointer", () => {
    document.body.innerHTML = "<div><form id=g></div><input id=j>";
    expect($("j").form).toBeNull();
  });
});

describe("selectedcontent — https://html.spec.whatwg.org/#the-selectedcontent-element", () => {
  test("the parser result mirrors the selected option (html5lib webkit02.dat)", () => {
    window = createWindow({
      html: "<select><button><selectedcontent></button><option>x<i>i</i><option selected>Y</select>",
    });
    expect(window.document.body.innerHTML).toBe(
      '<select><button><selectedcontent>Y</selectedcontent></button><option>x<i>i</i></option><option selected="">Y</option></select>',
    );
  });

  test("selection changes update selectedcontent; multiple selects do not", () => {
    document.body.innerHTML =
      "<select id=s><button><selectedcontent id=sc></selectedcontent></button><option>A</option><option>B<b>!</b></option></select>";
    expect($("sc").innerHTML).toBe("A");
    $("s").value = "B!";
    expect($("sc").innerHTML).toBe("B<b>!</b>");
    $("s").options[0].selected = true;
    expect($("sc").innerHTML).toBe("A");
    $("s").selectedIndex = -1;
    expect($("sc").innerHTML).toBe("");
    $("s").multiple = true;
    $("s").selectedIndex = 1;
    expect($("sc").innerHTML).toBe("");
  });
});
