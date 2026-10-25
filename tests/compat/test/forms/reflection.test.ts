/**
 * IDL attribute reflection on form elements — differential against jsdom.
 *
 * Spec:
 *   - reflecting content attributes in IDL attributes: https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes
 *   - interface definitions in §4.10 (HTMLInputElement, HTMLFormElement, HTMLButtonElement,
 *     HTMLSelectElement, HTMLTextAreaElement, HTMLOutputElement, HTMLProgressElement,
 *     HTMLMeterElement, HTMLLabelElement, HTMLFieldSetElement, HTMLLegendElement):
 *     https://html.spec.whatwg.org/#forms
 *
 * React writes many of these as properties (`maxLength`, `readOnly`, `htmlFor`, `noValidate`,
 * `defaultValue`), and reads them back through attributes in snapshots.
 */
import { describe } from "vitest";
import { differential, type AnyWindow, type DifferentialOptions } from "../../src/harness.ts";

type Probe = {
  tag: string;
  prop: string;
  attr?: string;
  values: unknown[];
  init?: Record<string, string>;
  /** jsdom lacks or misreflects this attribute: spec-derived expectation (same shape as `reflect()` output). */
  spec?: { expected: unknown[]; link: string; reason: string };
  fix?: { fix: (obs: any) => unknown; link: string; reason: string };
};

/** One expected `reflect()` row: setting `set` via the property yields `prop`/`attr`, and setting the attribute yields `viaAttr`. */
const row = (set: unknown, prop: unknown, attr: string | null, viaAttr: unknown, threw: string | null = null) => ({
  viaProp: { set: String(set), prop, attr, threw },
  viaAttr: typeof set === "string" ? viaAttr : "n/a",
});

const URL_DEFAULT = "http://localhost/";
const JSDOM_MISSING = "jsdom does not implement this IDL attribute";

/** For each probe value: set the property, read property + attribute; then set the attribute, read the property. */
function reflect(w: AnyWindow, p: Probe) {
  const results: unknown[] = [];
  const fresh = () => {
    const el = w.document.createElement(p.tag);
    for (const [k, v] of Object.entries(p.init ?? {})) el.setAttribute(k, v);
    w.document.body.appendChild(el);
    return el;
  };
  results.push({ default: fresh()[p.prop] });
  for (const value of p.values) {
    const el = fresh();
    let threw: string | null = null;
    try {
      el[p.prop] = value;
    } catch (e) {
      threw = (e as Error).name;
    }
    const viaProp = {
      set: String(value),
      prop: el[p.prop],
      attr: el.getAttribute(p.attr ?? p.prop.toLowerCase()),
      threw,
    };
    const el2 = fresh();
    if (typeof value === "string") el2.setAttribute(p.attr ?? p.prop.toLowerCase(), value);
    results.push({ viaProp, viaAttr: typeof value === "string" ? el2[p.prop] : "n/a" });
  }
  return results;
}

const probes: Probe[] = [
  // HTMLInputElement
  { tag: "input", prop: "maxLength", attr: "maxlength", values: [5, 0, -1, "7", "abc", "-3", " 4"] },
  { tag: "input", prop: "minLength", attr: "minlength", values: [5, -1, "x"] },
  { tag: "input", prop: "size", values: [10, 0, -1, "3", "0", "abc"] },
  { tag: "input", prop: "step", values: ["2", "any", ""] },
  { tag: "input", prop: "min", values: ["1", ""] },
  { tag: "input", prop: "multiple", values: [true, false, ""] },
  { tag: "input", prop: "readOnly", attr: "readonly", values: [true, false] },
  { tag: "input", prop: "required", values: [true, 0] },
  { tag: "input", prop: "disabled", values: [true, "yes"] },
  { tag: "input", prop: "autocomplete", values: ["off", "email", ""] },
  {
    tag: "input",
    prop: "inputMode",
    attr: "inputmode",
    values: ["numeric", "bogus"],
    spec: {
      expected: [{ default: "" }, row("numeric", "numeric", "numeric", "numeric"), row("bogus", "", "bogus", "")],
      link: "https://html.spec.whatwg.org/#dom-inputmode (limited to only known values)",
      reason: "jsdom reflects inputMode without limiting it to known values",
    },
  },
  {
    tag: "input",
    prop: "enterKeyHint",
    attr: "enterkeyhint",
    values: ["send", "bogus"],
    spec: {
      expected: [{ default: "" }, row("send", "send", "send", "send"), row("bogus", "", "bogus", "")],
      link: "https://html.spec.whatwg.org/#dom-enterkeyhint (limited to only known values)",
      reason: JSDOM_MISSING,
    },
  },
  { tag: "input", prop: "placeholder", values: ["hint"] },
  { tag: "input", prop: "accept", values: ["image/*,.pdf"] },
  { tag: "input", prop: "alt", values: ["alt text"] },
  { tag: "input", prop: "src", values: ["img.png", "http://other/x.png", ""] },
  {
    tag: "input",
    prop: "formAction",
    attr: "formaction",
    values: ["/submit", ""],
    spec: {
      expected: [
        { default: URL_DEFAULT },
        row("/submit", URL_DEFAULT + "submit", "/submit", URL_DEFAULT + "submit"),
        row("", URL_DEFAULT, "", URL_DEFAULT),
      ],
      link: "https://html.spec.whatwg.org/#dom-fs-formaction (missing or empty → document URL)",
      reason: JSDOM_MISSING,
    },
  },
  {
    tag: "input",
    prop: "formMethod",
    attr: "formmethod",
    values: ["POST", "dialog", "bogus", ""],
    spec: {
      expected: [
        { default: "" },
        row("POST", "post", "POST", "post"),
        row("dialog", "dialog", "dialog", "dialog"),
        row("bogus", "get", "bogus", "get"),
        row("", "get", "", "get"),
      ],
      link: "https://html.spec.whatwg.org/#dom-fs-formmethod (limited to only known values; missing default none, invalid default GET)",
      reason: JSDOM_MISSING,
    },
  },
  {
    tag: "input",
    prop: "formEnctype",
    attr: "formenctype",
    values: ["multipart/form-data", "bogus"],
    spec: {
      expected: [
        { default: "" },
        row("multipart/form-data", "multipart/form-data", "multipart/form-data", "multipart/form-data"),
        row("bogus", "application/x-www-form-urlencoded", "bogus", "application/x-www-form-urlencoded"),
      ],
      link: "https://html.spec.whatwg.org/#dom-fs-formenctype (limited to only known values; invalid default urlencoded)",
      reason: JSDOM_MISSING,
    },
  },
  { tag: "input", prop: "formTarget", attr: "formtarget", values: ["_blank"] },
  { tag: "input", prop: "formNoValidate", attr: "formnovalidate", values: [true] },
  {
    tag: "input",
    prop: "height",
    values: [10, -5, "20"],
    spec: {
      // Getter returns the rendered/natural image height, 0 when no image (always, here); setter reflects as unsigned long.
      expected: [{ default: 0 }, row(10, 0, "10", 0), row(-5, 0, "0", 0), row("20", 0, "20", 0)],
      link: "https://html.spec.whatwg.org/#dom-input-height",
      reason: JSDOM_MISSING,
    },
  },
  {
    tag: "input",
    prop: "width",
    values: [10, "x"],
    spec: {
      expected: [{ default: 0 }, row(10, 0, "10", 0), row("x", 0, "0", 0)],
      link: "https://html.spec.whatwg.org/#dom-input-width",
      reason: JSDOM_MISSING,
    },
  },
  { tag: "input", prop: "name", values: ["n"] },
  { tag: "input", prop: "dirName", attr: "dirname", values: ["d"] },
  { tag: "input", prop: "pattern", values: ["[a-z]+"] },
  { tag: "input", prop: "defaultValue", attr: "value", values: ["dv"] },
  { tag: "input", prop: "defaultChecked", attr: "checked", values: [true, false] },
  // HTMLFormElement
  { tag: "form", prop: "action", values: ["/go", "", "http://elsewhere/a?b#c"] },
  { tag: "form", prop: "method", values: ["POST", "get", "dialog", "bogus"] },
  { tag: "form", prop: "enctype", values: ["multipart/form-data", "text/plain", "bogus"] },
  {
    tag: "form",
    prop: "encoding",
    attr: "enctype",
    values: ["text/plain"],
    spec: {
      expected: [
        { default: "application/x-www-form-urlencoded" },
        row("text/plain", "text/plain", "text/plain", "text/plain"),
      ],
      link: "https://html.spec.whatwg.org/#dom-form-encoding",
      reason: JSDOM_MISSING,
    },
  },
  { tag: "form", prop: "target", values: ["_self"] },
  { tag: "form", prop: "noValidate", attr: "novalidate", values: [true] },
  { tag: "form", prop: "acceptCharset", attr: "accept-charset", values: ["utf-8"] },
  {
    tag: "form",
    prop: "autocomplete",
    values: ["off", "bogus", "ON"],
    spec: {
      expected: [
        { default: "on" },
        row("off", "off", "off", "off"),
        row("bogus", "on", "bogus", "on"),
        row("ON", "on", "ON", "on"),
      ],
      link: "https://html.spec.whatwg.org/#dom-form-autocomplete (limited to only known values; default on)",
      reason: JSDOM_MISSING,
    },
  },
  { tag: "form", prop: "name", values: ["f"] },
  {
    tag: "form",
    prop: "rel",
    values: ["noopener"],
    spec: {
      expected: [{ default: "" }, row("noopener", "noopener", "noopener", "noopener")],
      link: "https://html.spec.whatwg.org/#dom-form-rel",
      reason: JSDOM_MISSING,
    },
  },
  // HTMLButtonElement
  {
    tag: "button",
    prop: "type",
    values: ["button", "RESET", "bogus", "", "submit"],
    fix: {
      // Reflection setters store the given string verbatim; jsdom canonicalizes it.
      fix: (obs: Array<{ viaProp?: { set: string; attr: string | null } }>) => {
        for (const r of obs) if (r.viaProp) r.viaProp.attr = r.viaProp.set;
        return obs;
      },
      link: "https://html.spec.whatwg.org/#dom-button-type (reflect, limited to only known values: setter sets the content attribute to the new value)",
      reason: "jsdom's button.type setter writes the canonical keyword instead of the given value",
    },
  },
  { tag: "button", prop: "value", values: ["v"] },
  {
    tag: "button",
    prop: "formMethod",
    attr: "formmethod",
    values: ["post", "nope"],
    spec: {
      expected: [{ default: "" }, row("post", "post", "post", "post"), row("nope", "get", "nope", "get")],
      link: "https://html.spec.whatwg.org/#dom-fs-formmethod",
      reason: JSDOM_MISSING,
    },
  },
  {
    tag: "button",
    prop: "formAction",
    attr: "formaction",
    values: ["x"],
    spec: {
      expected: [{ default: URL_DEFAULT }, row("x", URL_DEFAULT + "x", "x", URL_DEFAULT + "x")],
      link: "https://html.spec.whatwg.org/#dom-fs-formaction",
      reason: JSDOM_MISSING,
    },
  },
  { tag: "button", prop: "name", values: ["b"] },
  // HTMLSelectElement
  { tag: "select", prop: "size", values: [3, 0, "-2", "x"] },
  { tag: "select", prop: "multiple", values: [true] },
  {
    tag: "select",
    prop: "autocomplete",
    values: ["off"],
    spec: {
      expected: [{ default: "" }, row("off", "off", "off", "off")],
      link: "https://html.spec.whatwg.org/#dom-fe-autocomplete (IDL-exposed autofill value)",
      reason: JSDOM_MISSING,
    },
  },
  // HTMLTextAreaElement
  { tag: "textarea", prop: "rows", values: [5, 0, -1, "x", "0"] },
  { tag: "textarea", prop: "cols", values: [40, 0, "x"] },
  { tag: "textarea", prop: "maxLength", attr: "maxlength", values: [10, -1, "x"] },
  { tag: "textarea", prop: "wrap", values: ["hard", "bogus"] },
  { tag: "textarea", prop: "placeholder", values: ["p"] },
  { tag: "textarea", prop: "dirName", attr: "dirname", values: ["d"] },
  // HTMLLabelElement / HTMLFieldSetElement / HTMLLegendElement / HTMLOutputElement
  { tag: "label", prop: "htmlFor", attr: "for", values: ["x"] },
  { tag: "fieldset", prop: "disabled", values: [true] },
  { tag: "fieldset", prop: "name", values: ["fs"] },
  { tag: "legend", prop: "align", values: ["left"] },
  { tag: "output", prop: "name", values: ["o"] },
  // HTMLProgressElement / HTMLMeterElement
  { tag: "progress", prop: "value", values: [0.5, -1, 3, "x", "0.25"] },
  { tag: "progress", prop: "max", values: [10, 0, -1, "x"] },
  { tag: "meter", prop: "value", values: [0.5, 5, -1, "0.3"] },
  { tag: "meter", prop: "min", values: [1, "x"] },
  { tag: "meter", prop: "max", values: [0.5, 10] },
  { tag: "meter", prop: "low", values: [0.2, -1, 2] },
  { tag: "meter", prop: "high", values: [0.8, 2] },
  { tag: "meter", prop: "optimum", values: [0.5, 9] },
  // HTMLOptionElement / HTMLOptGroupElement
  { tag: "option", prop: "label", values: ["L", ""] },
  { tag: "option", prop: "value", values: ["v"] },
  { tag: "option", prop: "disabled", values: [true] },
  { tag: "optgroup", prop: "label", values: ["g"] },
  { tag: "optgroup", prop: "disabled", values: [true] },
];

describe("reflection — https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes", () => {
  for (const p of probes) {
    const options: DifferentialOptions = p.spec
      ? { jsdomDeviation: { expected: p.spec.expected, spec: p.spec.link, reason: p.spec.reason } }
      : p.fix
        ? { jsdomFix: { fix: p.fix.fix, spec: p.fix.link, reason: p.fix.reason } }
        : {};
    differential(`${p.tag}.${p.prop}`, (w) => reflect(w, p), options);
  }

  differential("output.htmlFor is a DOMTokenList reflecting for", (w) => {
    const o = w.document.createElement("output");
    o.setAttribute("for", "a b");
    const before = Array.from(o.htmlFor as ArrayLike<string>);
    o.htmlFor.add("c");
    return {
      before,
      attr: o.getAttribute("for"),
      isTokenList: Object.prototype.toString.call(o.htmlFor),
      length: o.htmlFor.length,
    };
  });

  differential("progress.position and meter value clamping", (w) => {
    const p = w.document.createElement("progress");
    const indeterminate = p.position;
    p.max = 4;
    p.value = 1;
    const m = w.document.createElement("meter");
    m.setAttribute("min", "10");
    m.setAttribute("max", "5");
    m.setAttribute("value", "20");
    return {
      indeterminate,
      position: p.position,
      meter: { min: m.min, max: m.max, value: m.value, low: m.low, high: m.high, optimum: m.optimum },
    };
  });

  differential("input.list resolves a datalist by id, else null", (w) => {
    w.document.body.innerHTML =
      "<input id=a list=dl><input id=b list=notdl><datalist id=dl></datalist><div id=notdl></div>";
    return [w.document.getElementById("a").list, w.document.getElementById("b").list];
  });

  differential(
    "form.relList and input.form are readonly-ish; assigning form does nothing",
    (w) => {
      w.document.body.innerHTML = "<form id=f rel='a b'></form><input id=i>";
      const i = w.document.getElementById("i");
      try {
        i.form = w.document.getElementById("f");
      } catch {
        /* strict-mode assignment to getter-only property */
      }
      return { relList: Array.from(w.document.getElementById("f").relList as ArrayLike<string>), form: i.form };
    },
    {
      jsdomDeviation: {
        expected: { relList: ["a", "b"], form: null },
        spec: "https://html.spec.whatwg.org/#dom-form-rellist",
        reason: JSDOM_MISSING,
      },
    },
  );
});
