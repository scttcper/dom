/**
 * Form-associated custom elements in the entry list, ElementInternals form/labels, the
 * autocomplete IDL attribute, and label activation around interactive content.
 *
 * Spec: HTML Standard
 *   - FACE submission:      https://html.spec.whatwg.org/#face-submission-value, https://html.spec.whatwg.org/#face-state,
 *                           https://html.spec.whatwg.org/#face-entry-construction
 *   - ElementInternals:     https://html.spec.whatwg.org/#dom-elementinternals-form, https://html.spec.whatwg.org/#dom-elementinternals-labels
 *   - autofill:             https://html.spec.whatwg.org/#autofill-field, https://html.spec.whatwg.org/#autofill-processing-model,
 *                           https://html.spec.whatwg.org/#dom-fe-autocomplete
 *   - label activation:     https://html.spec.whatwg.org/#the-label-element:activation-behaviour,
 *                           https://html.spec.whatwg.org/#interactive-content, https://html.spec.whatwg.org/#interactive-elements
 *
 * jsdom has no setFormValue, ElementInternals form/labels or autofill processing (it reflects
 * `autocomplete` as a plain string), so these assert the spec directly.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
let w: any;
beforeEach(() => {
  w = createWindow();
});

const $ = (id: string) => w.document.getElementById(id);
const describeNode = (n: any): string => (n === null ? "null" : n === undefined ? "undefined" : n.localName + (n.id ? "#" + n.id : ""));
const entries = (fd: any) => [...fd.entries()].map(([k, v]: [string, any]) => [k, typeof v === "string" ? v : `File(${v.name})`]);

function defineFace(): void {
  w.customElements.define(
    "x-face",
    class extends w.HTMLElement {
      static formAssociated = true;
      internals: any;
      constructor() {
        super();
        this.internals = (this as any).attachInternals();
      }
    },
  );
}

describe("FACE submission value — https://html.spec.whatwg.org/#face-submission-value", () => {
  test("setFormValue(string | FormData | File | null): a list of entries is appended as is, a value needs a name, null contributes nothing (https://html.spec.whatwg.org/#face-entry-construction, https://html.spec.whatwg.org/#face-state)", () => {
    defineFace();
    w.document.body.innerHTML = `<form id=f><x-face id=a name=a></x-face><x-face id=b name=b></x-face><x-face id=c name=c></x-face><x-face id=d name=d></x-face><x-face id=e></x-face></form>`;
    $("a").internals.setFormValue("one", "restore-state");
    const fd = new w.FormData();
    fd.append("x", "1");
    fd.append("y", "2");
    $("b").internals.setFormValue(fd);
    $("c").internals.setFormValue(new w.File(["z"], "z.txt"));
    $("d").internals.setFormValue(null);
    $("e").internals.setFormValue("unnamed");
    expect(entries(new w.FormData($("f")))).toEqual([["a", "one"], ["x", "1"], ["y", "2"], ["c", "File(z.txt)"]]);
  });

  test("a disabled FACE (own attribute or disabled fieldset) contributes nothing", () => {
    defineFace();
    w.document.body.innerHTML = `<form id=f><x-face id=a name=a disabled></x-face><fieldset disabled><x-face id=b name=b></x-face></fieldset></form>`;
    $("a").internals.setFormValue("v");
    $("b").internals.setFormValue("v");
    expect(entries(new w.FormData($("f")))).toEqual([]);
  });
});

describe("ElementInternals form and labels — https://html.spec.whatwg.org/#dom-elementinternals-form", () => {
  test("form follows the form owner (ancestor or form=); labels lists for= and wrapping labels (https://html.spec.whatwg.org/#dom-elementinternals-labels)", () => {
    defineFace();
    w.document.body.innerHTML = `<form id=f1><x-face id=a></x-face></form><form id=f2></form><x-face id=b form=f2></x-face><label for=b id=l1>1</label><label id=l2><x-face id=c></x-face></label>`;
    expect({
      forms: ["a", "b", "c"].map((id) => describeNode($(id).internals.form)),
      labelsB: Array.from($("b").internals.labels, describeNode),
      labelsC: Array.from($("c").internals.labels, describeNode),
      labelControl: describeNode($("l1").control),
    }).toEqual({ forms: ["form#f1", "form#f2", "null"], labelsB: ["label#l1"], labelsC: ["label#l2"], labelControl: "x-face#b" });
  });

  test("form and labels throw NotSupportedError for a custom element that is not form-associated", () => {
    w.customElements.define(
      "x-plain",
      class extends w.HTMLElement {
        internals = (this as any).attachInternals();
      },
    );
    const el = w.document.createElement("x-plain");
    const read = (k: string) => {
      try {
        return describeNode(el.internals[k]);
      } catch (e) {
        return (e as Error).name;
      }
    };
    expect([read("form"), read("labels")]).toEqual(["NotSupportedError", "NotSupportedError"]);
  });
});

describe("autocomplete — https://html.spec.whatwg.org/#autofill-processing-model", () => {
  test("the IDL attribute returns the normalized autofill value; invalid token lists give '' (https://html.spec.whatwg.org/#autofill-field, https://html.spec.whatwg.org/#dom-fe-autocomplete)", () => {
    const values = ["on", "OFF", "email", "shipping email", "section-Foo billing tel", "home tel", "work email", "bogus", "email email", "name webauthn", "off email", "cc-number", " email "];
    const out = values.map((v) => {
      const i = w.document.createElement("input");
      i.setAttribute("autocomplete", v);
      return i.autocomplete;
    });
    expect(out).toEqual(["on", "off", "email", "shipping email", "section-foo billing tel", "home tel", "work email", "", "", "name webauthn", "", "cc-number", "email"]);
  });

  test("textarea exposes the autofill value; form.autocomplete is on/off with on as the default", () => {
    const t = w.document.createElement("textarea");
    t.setAttribute("autocomplete", "street-address");
    const f = w.document.createElement("form");
    const out = [t.autocomplete, f.autocomplete];
    f.autocomplete = "off";
    expect([...out, f.getAttribute("autocomplete")]).toEqual(["street-address", "on", "off"]);
  });
});

describe("label activation and interactive content — https://html.spec.whatwg.org/#the-label-element:activation-behaviour", () => {
  test("clicks on interactive content inside a label do not activate the labeled control; plain text does (https://html.spec.whatwg.org/#interactive-content)", () => {
    w.document.body.innerHTML = `<label id=l><input type=checkbox id=c><a id=a href="#x">link</a><span id=s>text</span><button id=b type=button>b</button></label>`;
    const states: boolean[] = [];
    for (const id of ["a", "b", "s"]) {
      $(id).click();
      states.push($("c").checked);
    }
    expect(states).toEqual([false, false, true]);
  });
});
