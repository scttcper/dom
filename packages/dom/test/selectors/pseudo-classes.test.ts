/**
 * Element-state pseudo-classes that component tests query (`toBeInvalid`, `:focus-visible`
 * styles, `[popover]`/`<dialog>` state, custom element state).
 *
 * Specs:
 *   HTML §4.16.3 Pseudo-classes — https://html.spec.whatwg.org/#pseudo-classes
 *     (each test links its #selector-* definition)
 *   Selectors 4 §9 input pseudo-classes — https://drafts.csswg.org/selectors-4/#input-pseudos
 *   Selectors 4 §8 location pseudo-classes (:target-within) — https://drafts.csswg.org/selectors-4/#the-target-within-pseudo
 *   Selectors 4 §4 logical combinations (forgiving / unforgiving lists) — https://drafts.csswg.org/selectors-4/#logical-combination
 *   CSS Custom States — https://html.spec.whatwg.org/#selector-custom
 *
 * Where jsdom's engine (@asamuzakjp/dom-selector) implements a pseudo-class the same markup is
 * queried on it too (`differential`), since suites were written against it.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow, type Document, type Window } from "@rtd/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
let window: Window;
let document: Document;
beforeEach(() => {
  window = createWindow();
  document = window.document;
});

const ids = (list: ArrayLike<any>) => Array.from(list, (e: any) => e.id);
const $$ = (sel: string) => ids(document.querySelectorAll(sel));
const byId = (id: string) => document.getElementById(id) as any;

/** Matched ids on @rtd/dom and on jsdom for the same markup. */
function differential(html: string, sel: string): { rtd: string[]; jsdom: string[] } {
  document.body!.innerHTML = html;
  const jsdom = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
  return { rtd: $$(sel), jsdom: ids(jsdom.querySelectorAll(sel)) };
}

function same(html: string, sel: string, expected: string[]): void {
  expect(differential(html, sel)).toEqual({ rtd: expected, jsdom: expected });
}

describe(":placeholder-shown — https://html.spec.whatwg.org/#selector-placeholder-shown", () => {
  test("input/textarea with a placeholder and an empty value", () => {
    same(
      `<input id=a placeholder=x><input id=b placeholder=x value=v><input id=c><textarea id=d placeholder=x></textarea><textarea id=e placeholder=x>t</textarea>`,
      ":placeholder-shown",
      ["a", "d"],
    );
  });

  test("stops matching once the value is set through the IDL attribute", () => {
    document.body!.innerHTML = `<input id=a placeholder=x>`;
    byId("a").value = "typed";
    expect($$(":placeholder-shown")).toEqual([]);
  });
});

describe(":default — https://html.spec.whatwg.org/#selector-default", () => {
  test("a form's default button, checked-by-attribute checkboxes/radios and selected-by-attribute options", () => {
    same(
      `<form><input id=t><button id=b1>1</button><button id=b2>2</button></form><input id=c type=checkbox checked><input id=r type=radio><select><option id=o1>1</option><option id=o2 selected>2</option></select>`,
      ":default",
      ["b1", "c", "o2"],
    );
  });

  test("checkedness changes do not affect :default (it follows the checked content attribute)", () => {
    document.body!.innerHTML = `<input id=c type=checkbox checked>`;
    byId("c").checked = false;
    expect($$(":default")).toEqual(["c"]);
  });
});

describe(":indeterminate — https://html.spec.whatwg.org/#selector-indeterminate", () => {
  test("a checkbox whose indeterminate IDL attribute is true", () => {
    document.body!.innerHTML = `<input id=c type=checkbox><input id=d type=checkbox>`;
    byId("c").indeterminate = true;
    expect($$(":indeterminate")).toEqual(["c"]);
  });

  test("radio buttons of a group with no checked button, and progress without a value", () => {
    same(
      `<input id=r1 type=radio name=g><input id=r2 type=radio name=g><input id=s1 type=radio name=h checked><input id=s2 type=radio name=h><progress id=p></progress><progress id=q value=1></progress>`,
      ":indeterminate",
      ["r1", "r2", "p"],
    );
  });
});

describe(":read-write / :read-only — https://html.spec.whatwg.org/#selector-read-write", () => {
  test("mutable text controls and editing hosts are read-write; everything else is read-only", () => {
    same(
      `<input id=a><input id=b readonly><input id=c disabled><input id=d type=checkbox><textarea id=e></textarea><textarea id=f readonly></textarea><div id=g contenteditable></div><div id=h></div>`,
      ":read-write",
      ["a", "e", "g"],
    );
    expect($$("body :read-only")).toEqual(["b", "c", "d", "f", "h"]);
  });
});

describe(":required / :optional — https://html.spec.whatwg.org/#selector-required", () => {
  test("input, select and textarea with/without required; other elements match neither", () => {
    same(`<input id=a required><input id=b><select id=c required></select><textarea id=d></textarea><button id=e></button>`, ":required", ["a", "c"]);
    expect($$(":optional")).toEqual(["b", "d"]);
  });
});

describe(":valid / :invalid — https://html.spec.whatwg.org/#selector-valid", () => {
  test("candidates for constraint validation, and forms/fieldsets containing an invalid control", () => {
    same(
      `<form id=f><fieldset id=fs><input id=a required></fieldset><input id=b></form><form id=g><input id=c value=x required></form>`,
      ":invalid",
      ["f", "fs", "a"],
    );
    expect($$(":valid")).toEqual(["b", "g", "c"]);
  });

  test("setCustomValidity makes a control invalid", () => {
    document.body!.innerHTML = `<input id=a>`;
    byId("a").setCustomValidity("nope");
    expect($$(":invalid")).toEqual(["a"]);
  });

  test("disabled and readonly controls are barred from validation and match neither", () => {
    document.body!.innerHTML = `<input id=a required disabled><input id=b required readonly>`;
    expect([$$(":invalid"), $$(":valid")]).toEqual([[], []]);
  });
});

describe(":in-range / :out-of-range — https://html.spec.whatwg.org/#selector-in-range", () => {
  test("range-limited inputs compare their value with min/max", () => {
    same(
      `<input id=a type=number min=1 max=5 value=3><input id=b type=number min=1 max=5 value=9><input id=c type=number value=9><input id=d type=text min=1 value=0>`,
      ":in-range",
      ["a"],
    );
    expect($$(":out-of-range")).toEqual(["b"]);
  });
});

describe(":user-invalid / :user-valid — https://html.spec.whatwg.org/#selector-user-invalid", () => {
  test("do not match before the user interacted (user validity is false)", () => {
    document.body!.innerHTML = `<form><input id=a required><input id=b></form>`;
    expect([$$(":user-invalid"), $$(":user-valid")]).toEqual([[], []]);
  });

  // TODO(selectors): selectors/state.ts maps :user-invalid/:user-valid to `never`; there is no
  // user-validity flag (https://html.spec.whatwg.org/#user-validity), which the form submission
  // algorithm and user edits (input/change followed by blur) set to true.
  test.fails("match after a form submission attempt sets user validity", () => {
    document.body!.innerHTML = `<form id=f><input id=a required><input id=b></form>`;
    byId("f").requestSubmit();
    expect([$$(":user-invalid"), $$(":user-valid")]).toEqual([["a"], ["b"]]);
  });
});

describe(":focus-visible — https://html.spec.whatwg.org/#selector-focus-visible", () => {
  test("a focused text input matches (it always shows a focus indicator)", () => {
    document.body!.innerHTML = `<input id=a><button id=b>b</button>`;
    byId("a").focus();
    expect($$(":focus-visible")).toEqual(["a"]);
  });

  test("nothing matches without focus", () => {
    document.body!.innerHTML = `<input id=a>`;
    expect($$(":focus-visible")).toEqual([]);
  });
});

describe(":defined — https://html.spec.whatwg.org/#selector-defined", () => {
  test("built-in elements are defined; custom elements only after customElements.define()", () => {
    document.body!.innerHTML = `<div id=a></div><x-late id=b></x-late><svg id=c></svg>`;
    expect($$("body :defined")).toEqual(["a", "c"]);
    (window as any).customElements.define("x-late", class extends (window as any).HTMLElement {});
    expect($$("body :defined")).toEqual(["a", "b", "c"]);
  });
});

describe(":open, :modal, :popover-open — https://html.spec.whatwg.org/#selector-open", () => {
  test(":open matches open details and dialog elements", () => {
    document.body!.innerHTML = `<details id=a open><summary>s</summary></details><details id=b><summary>s</summary></details><dialog id=c open></dialog><dialog id=d></dialog>`;
    expect($$(":open")).toEqual(["a", "c"]);
  });

  test(":modal matches a dialog opened with showModal(), not show() (https://html.spec.whatwg.org/#selector-modal)", () => {
    document.body!.innerHTML = `<dialog id=a></dialog><dialog id=b></dialog>`;
    byId("a").showModal();
    byId("b").show();
    expect($$(":modal")).toEqual(["a"]);
    byId("a").close();
    expect($$(":modal")).toEqual([]);
  });

  test(":popover-open follows showPopover()/hidePopover() (https://html.spec.whatwg.org/#selector-popover-open)", () => {
    document.body!.innerHTML = `<div id=a popover>p</div><div id=b popover>q</div>`;
    byId("a").showPopover();
    expect($$(":popover-open")).toEqual(["a"]);
    byId("a").hidePopover();
    expect($$(":popover-open")).toEqual([]);
  });
});

describe(":target-within — https://drafts.csswg.org/selectors-4/#the-target-within-pseudo", () => {
  test("the target element and its ancestors", () => {
    const w = createWindow({ url: "http://localhost/#t", html: `<div id=o><p id=t></p></div><div id=x></div>` }) as any;
    expect(ids(w.document.querySelectorAll("div:target-within, p:target-within"))).toEqual(["o", "t"]);
  });
});

describe(":autofill — https://html.spec.whatwg.org/#selector-autofill", () => {
  test("never matches (no autofill), and the -webkit- alias parses", () => {
    document.body!.innerHTML = `<input id=a>`;
    expect([$$(":autofill"), $$(":-webkit-autofill")]).toEqual([[], []]);
  });
});

describe(":state() — https://html.spec.whatwg.org/#selector-custom", () => {
  test("matches custom elements whose ElementInternals.states contains the identifier", () => {
    class XToggle extends (window as any).HTMLElement {
      internals = this.attachInternals();
    }
    (window as any).customElements.define("x-toggle", XToggle);
    document.body!.innerHTML = `<x-toggle id=a></x-toggle><x-toggle id=b></x-toggle>`;
    byId("a").internals.states.add("on");
    expect($$(":state(on)")).toEqual(["a"]);
    byId("a").internals.states.delete("on");
    expect($$(":state(on)")).toEqual([]);
  });
});

describe("logical combinations — https://drafts.csswg.org/selectors-4/#logical-combination", () => {
  test(":is()/:where() take forgiving lists (invalid arguments dropped); :not() and :has() are unforgiving", () => {
    document.body!.innerHTML = `<p id=a class=x></p>`;
    expect($$(":is(.x, :bogus)")).toEqual(["a"]);
    expect($$(":where(:bogus, p)")).toEqual(["a"]);
    expect(() => document.querySelector(":not(.x, :bogus)")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(() => document.querySelector(":has(.x, :bogus)")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });

  test(":has() cannot be nested in :has() (https://drafts.csswg.org/selectors-4/#relational)", () => {
    expect(() => document.querySelector(":has(:has(p))")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });

  test("pseudo-elements are invalid inside :is()/:not()", () => {
    expect(() => document.querySelector(":not(::before)")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });

  test(":not() with a list matches elements matching none of the arguments", () => {
    same(`<p id=a class=x></p><p id=b class=y></p><p id=c></p>`, "p:not(.x, .y)", ["c"]);
  });
});
