/**
 * Implicit ARIA roles of HTML elements, and the ARIA states Testing Library's `*ByRole`
 * filters read.
 *
 * Specs:
 *   HTML-AAM §3.4 "HTML Element Role Mappings" — https://w3c.github.io/html-aam/#html-element-role-mappings
 *   HTML-AAM §3.5 "HTML Attribute State and Property Mappings" — https://w3c.github.io/html-aam/#html-attribute-state-and-property-mappings
 *   WAI-ARIA 1.2 §6.6/6.7 states and properties — https://www.w3.org/TR/wai-aria-1.2/#state_prop_def
 *
 * Every assertion runs on both engines (helpers.ts `both`): @ctrl/dom/aria on @ctrl/dom and
 * Testing Library 10.4.2 role-helpers (aria-query@5.3.0) on jsdom. aria-query's table ignores
 * element context (header in sectioning content, td in a grid, ...): tests prefixed "oracle:"
 * pin that documented deviation (docs/deviations.md, "Roles follow aria-query@5.3.0"), with
 * HTML-AAM's mapping in a comment, because `*ByRole` must find the same elements.
 */
import { describe, expect, test } from "vitest";
import { both, testNode, type AriaApi } from "./helpers.ts";

function expectRoles(html: string, expected: string[]): void {
  expect(both(html, (api, doc) => api.implicitRoles(testNode(doc)))).toEqual({ "ctrl-dom": expected, upstream: expected });
}

function expectState<K extends keyof AriaApi>(html: string, state: K, expected: unknown): void {
  expect(both(html, (api, doc) => (api[state] as (el: unknown) => unknown)(testNode(doc)))).toEqual({
    "ctrl-dom": expected,
    upstream: expected,
  });
}

const AAM = "https://w3c.github.io/html-aam/";

describe(`header and footer — ${AAM}#el-header, ${AAM}#el-footer`, () => {
  test("scoped to body: banner and contentinfo", () => {
    expectRoles(`<header data-test>Site</header>`, ["banner"]);
    expectRoles(`<footer data-test>Site</footer>`, ["contentinfo"]);
  });

  test("oracle: inside article/aside/main/nav/section they stay banner/contentinfo", () => {
    // HTML-AAM (#el-header-ancestorbody, #el-footer-ancestorbody): generic in sectioning content.
    expectRoles(`<article><header data-test>Post</header></article>`, ["banner"]);
    expectRoles(`<section><footer data-test>Post</footer></section>`, ["contentinfo"]);
    expectRoles(`<main><header data-test>x</header></main>`, ["banner"]);
  });
});

describe(`section, form, aside — ${AAM}#el-section, ${AAM}#el-form, ${AAM}#el-aside`, () => {
  test("section is region only with an accessible name source (aria-label / aria-labelledby), generic otherwise", () => {
    expectRoles(`<section data-test aria-label="Intro"></section>`, ["region"]);
    expectRoles(`<h2 id="h">T</h2><section data-test aria-labelledby="h"></section>`, ["region"]);
    expectRoles(`<section data-test></section>`, ["generic"]);
    expectRoles(`<section data-test aria-label=""></section>`, ["generic"]);
  });

  test("oracle: a title does not make a section a region", () => {
    // HTML-AAM: region whenever the section has an accessible name (title included).
    expectRoles(`<section data-test title="Intro"></section>`, ["generic"]);
  });

  test("form is form only when named (aria-label, aria-labelledby or name), else no role", () => {
    expectRoles(`<form data-test aria-label="Login"></form>`, ["form"]);
    expectRoles(`<form data-test name="login"></form>`, ["form"]);
    expectRoles(`<form data-test></form>`, []);
  });

  test("oracle: aside is complementary in any context", () => {
    // HTML-AAM (#el-aside-ancestorbodymain): generic inside sectioning content unless named.
    expectRoles(`<aside data-test></aside>`, ["complementary"]);
    expectRoles(`<article><aside data-test></aside></article>`, ["complementary"]);
  });
});

describe(`img — ${AAM}#el-img, ${AAM}#el-img-empty-alt`, () => {
  test("img with alt text or without alt is img; alt=\"\" is presentation", () => {
    expectRoles(`<img data-test alt="Logo">`, ["img"]);
    expectRoles(`<img data-test>`, ["img"]);
    expectRoles(`<img data-test alt="">`, ["presentation"]);
  });
});

describe(`a and area — ${AAM}#el-a, ${AAM}#el-a-no-href, ${AAM}#el-area, ${AAM}#el-area-no-href`, () => {
  test("with a non-empty href: link; without: generic", () => {
    expectRoles(`<a data-test href="/x">x</a>`, ["link"]);
    expectRoles(`<a data-test>x</a>`, ["generic"]);
    expectRoles(`<map><area data-test href="/x" alt="x"></map>`, ["link"]);
    expectRoles(`<map><area data-test alt="x"></map>`, ["generic"]);
  });

  test("oracle: an empty href counts as no href", () => {
    // HTML-AAM maps any a[href] to link.
    expectRoles(`<a data-test href="">x</a>`, ["generic"]);
  });
});

describe(`tables and grids — ${AAM}#el-td, ${AAM}#el-td-gridcell, ${AAM}#el-th, ${AAM}#el-th-columnheader, ${AAM}#el-th-rowheader`, () => {
  test("table parts: table, rowgroup, row, cell, caption", () => {
    const table = (cell: string) => `<table><caption>c</caption><thead><tr><th>h</th></tr></thead><tbody><tr>${cell}</tr></tbody></table>`;
    expectRoles(table(`<td data-test>x</td>`), ["cell"]);
    expectRoles(`<table data-test></table>`, ["table"]);
    expectRoles(`<table><tbody data-test><tr><td>x</td></tr></tbody></table>`, ["rowgroup"]);
    expectRoles(`<table><tbody><tr data-test><td>x</td></tr></tbody></table>`, ["row"]);
    expectRoles(`<table><caption data-test>c</caption></table>`, ["caption"]);
  });

  test("th: scope=row/rowgroup → rowheader, scope=col/colgroup or no scope → columnheader (scope is case-insensitive)", () => {
    const th = (attrs: string) => `<table><tbody><tr><th data-test ${attrs}>h</th></tr></tbody></table>`;
    expectRoles(th(`scope="row"`), ["rowheader"]);
    expectRoles(th(`scope="ROWGROUP"`), ["rowheader"]);
    expectRoles(th(`scope="col"`), ["columnheader"]);
    expectRoles(th(`scope="colgroup"`), ["columnheader"]);
    expectRoles(th(``), ["columnheader"]);
  });

  test("oracle: cells of a role=grid table stay cell / columnheader", () => {
    // HTML-AAM (#el-td-gridcell, #el-th-gridcell): gridcell when the table is a grid/treegrid.
    expectRoles(`<table role="grid"><tbody><tr><td data-test>x</td></tr></tbody></table>`, ["cell"]);
    expectRoles(`<table role="grid"><tbody><tr><th data-test>x</th></tr></tbody></table>`, ["columnheader"]);
  });
});

describe(`select — ${AAM}#el-select-combobox, ${AAM}#el-select-listbox`, () => {
  test("no multiple and no size: combobox; multiple or a size attribute: listbox", () => {
    expectRoles(`<select data-test><option>a</option></select>`, ["combobox"]);
    expectRoles(`<select data-test multiple><option>a</option></select>`, ["listbox"]);
    expectRoles(`<select data-test size="4"><option>a</option></select>`, ["listbox"]);
  });

  test("oracle: size=1 is listbox (any size attribute)", () => {
    // HTML-AAM: combobox when size is not greater than 1.
    expectRoles(`<select data-test size="1"><option>a</option></select>`, ["listbox"]);
  });

  test("option, optgroup, datalist", () => {
    expectRoles(`<select><option data-test>a</option></select>`, ["option"]);
    expectRoles(`<select><optgroup data-test label="g"></optgroup></select>`, ["group"]);
    expectRoles(`<datalist data-test></datalist>`, ["listbox"]);
  });
});

describe(`input types — ${AAM}#el-input-text and following`, () => {
  test("text-like types without list: textbox; search: searchbox", () => {
    for (const type of ["text", "email", "tel", "url"]) expectRoles(`<input data-test type="${type}">`, ["textbox"]);
    expectRoles(`<input data-test>`, ["textbox"]);
    expectRoles(`<input data-test type="search">`, ["searchbox"]);
  });

  test("text-like types with a list attribute: combobox (#el-input-textetc-autocomplete)", () => {
    for (const type of ["text", "email", "tel", "url", "search"]) {
      expectRoles(`<input data-test type="${type}" list="l"><datalist id="l"></datalist>`, ["combobox"]);
    }
  });

  test("buttons, checkbox, radio, range, number", () => {
    for (const type of ["button", "submit", "reset", "image"]) expectRoles(`<input data-test type="${type}">`, ["button"]);
    expectRoles(`<input data-test type="checkbox">`, ["checkbox"]);
    expectRoles(`<input data-test type="radio">`, ["radio"]);
    expectRoles(`<input data-test type="range">`, ["slider"]);
    expectRoles(`<input data-test type="number">`, ["spinbutton"]);
  });

  test("types without a role mapping (hidden, color, date, file, password, ...) have no implicit role", () => {
    for (const type of ["hidden", "color", "date", "datetime-local", "file", "month", "password", "time", "week"]) {
      expectRoles(`<input data-test type="${type}">`, []);
    }
  });

  test("the type attribute is matched ASCII case-insensitively", () => {
    expectRoles(`<input data-test type="CheckBox">`, ["checkbox"]);
    expectRoles(`<input data-test type="SEARCH">`, ["searchbox"]);
  });
});

describe(`other mappings — ${AAM}#html-element-role-mappings`, () => {
  test("landmarks, lists, grouping and text-level elements", () => {
    const cases: Array<[string, string[]]> = [
      [`<main data-test></main>`, ["main"]],
      [`<nav data-test></nav>`, ["navigation"]],
      [`<article data-test></article>`, ["article"]],
      [`<ul data-test></ul>`, ["list"]],
      [`<ol data-test></ol>`, ["list"]],
      [`<menu data-test></menu>`, ["list"]],
      [`<ul><li data-test>x</li></ul>`, ["listitem"]],
      [`<dl><dt data-test>t</dt><dd>d</dd></dl>`, ["term"]],
      [`<dl><dt>t</dt><dd data-test>d</dd></dl>`, ["definition"]],
      [`<hr data-test>`, ["separator"]],
      [`<output data-test></output>`, ["status"]],
      [`<dialog data-test></dialog>`, ["dialog"]],
      [`<details data-test><summary>s</summary></details>`, ["group"]],
      [`<fieldset data-test></fieldset>`, ["group"]],
      [`<address data-test></address>`, ["group"]],
      [`<h4 data-test>h</h4>`, ["heading"]],
      [`<progress data-test></progress>`, ["progressbar"]],
      [`<meter data-test></meter>`, ["meter"]],
      [`<textarea data-test></textarea>`, ["textbox"]],
      [`<blockquote data-test></blockquote>`, ["blockquote"]],
      [`<figure data-test></figure>`, ["figure"]],
      [`<p data-test></p>`, ["paragraph"]],
      [`<time data-test></time>`, ["time"]],
      [`<del data-test></del>`, ["deletion"]],
      [`<ins data-test></ins>`, ["insertion"]],
      [`<mark data-test></mark>`, ["mark"]],
      [`<code data-test></code>`, ["code"]],
      [`<em data-test></em>`, ["emphasis"]],
      [`<strong data-test></strong>`, ["strong"]],
      [`<sub data-test></sub>`, ["subscript"]],
      [`<sup data-test></sup>`, ["superscript"]],
      [`<div data-test></div>`, ["generic"]],
      [`<span data-test></span>`, ["generic"]],
    ];
    for (const [html, roles] of cases) expectRoles(html, roles);
  });

  test("elements with no corresponding role: label, legend, summary, abbr, figcaption, custom elements", () => {
    for (const html of [
      `<label data-test></label>`,
      `<fieldset><legend data-test></legend></fieldset>`,
      `<details><summary data-test>s</summary></details>`,
      `<abbr data-test></abbr>`,
      `<figure><figcaption data-test></figcaption></figure>`,
      `<x-widget data-test></x-widget>`,
    ]) {
      expectRoles(html, []);
    }
  });

  test("oracle: newer mappings are absent (s → deletion, search → search, hgroup → group)", () => {
    expectRoles(`<s data-test></s>`, []);
    expectRoles(`<search data-test></search>`, []);
    expectRoles(`<hgroup data-test></hgroup>`, ["generic"]);
  });
});

describe("explicit roles — https://w3c.github.io/aria/#document-handling_author-errors_roles", () => {
  test("getRoles groups elements by their first role token; inaccessible elements only with hidden: true", () => {
    const html = `<div data-id="a" role="tab button"></div><button data-id="b">b</button><button data-id="c" hidden>c</button><nav data-id="d" aria-hidden="true"></nav>`;
    expect(both(html, (api, doc) => api.roles(doc.body))).toEqual({
      "ctrl-dom": { tab: ["a"], button: ["b"] },
      upstream: { tab: ["a"], button: ["b"] },
    });
    expect(both(html, (api, doc) => api.roles(doc.body, { hidden: true }))).toEqual({
      "ctrl-dom": { tab: ["a"], button: ["b", "c"], navigation: ["d"] },
      upstream: { tab: ["a"], button: ["b", "c"], navigation: ["d"] },
    });
  });
});

describe("aria-checked — https://www.w3.org/TR/wai-aria-1.2/#aria-checked, https://w3c.github.io/html-aam/#att-checked", () => {
  test("checkbox and radio inputs use their checkedness (the IDL state, not the attribute)", () => {
    expectState(`<input data-test type="checkbox" checked>`, "checked", true);
    expectState(`<input data-test type="checkbox">`, "checked", false);
    expectState(`<input data-test type="radio" checked>`, "checked", true);
    expect(
      both(`<input data-test type="checkbox" checked>`, (api, doc) => {
        const el = testNode(doc);
        el.checked = false;
        return api.checked(el);
      }),
    ).toEqual({ "ctrl-dom": false, upstream: false });
  });

  test("an indeterminate checkbox is neither checked nor unchecked (mixed)", () => {
    expect(
      both(`<input data-test type="checkbox">`, (api, doc) => {
        const el = testNode(doc);
        el.indeterminate = true;
        return api.checked(el);
      }),
    ).toEqual({ "ctrl-dom": undefined, upstream: undefined });
  });

  test("native checkedness wins over aria-checked on inputs", () => {
    expectState(`<input data-test type="checkbox" aria-checked="true">`, "checked", false);
  });

  test("other elements read aria-checked: true/false, mixed and invalid values are undefined", () => {
    expectState(`<div data-test role="checkbox" aria-checked="true"></div>`, "checked", true);
    expectState(`<div data-test role="switch" aria-checked="false"></div>`, "checked", false);
    expectState(`<div data-test role="checkbox" aria-checked="mixed"></div>`, "checked", undefined);
    expectState(`<div data-test role="checkbox" aria-checked="yes"></div>`, "checked", undefined);
    expectState(`<div data-test role="checkbox"></div>`, "checked", undefined);
  });
});

describe("aria-pressed, aria-expanded, aria-busy — https://www.w3.org/TR/wai-aria-1.2/#aria-pressed", () => {
  test("true/false map to booleans; mixed, absent and invalid values are undefined", () => {
    expectState(`<button data-test aria-pressed="true"></button>`, "pressed", true);
    expectState(`<button data-test aria-pressed="false"></button>`, "pressed", false);
    expectState(`<button data-test aria-pressed="mixed"></button>`, "pressed", undefined);
    expectState(`<button data-test></button>`, "pressed", undefined);
    expectState(`<button data-test aria-expanded="true"></button>`, "expanded", true);
    expectState(`<button data-test aria-expanded="false"></button>`, "expanded", false);
    expectState(`<button data-test aria-expanded="undefined"></button>`, "expanded", undefined);
  });

  test("oracle: aria-expanded is not mapped from <details open> (https://w3c.github.io/html-aam/#att-open-details)", () => {
    expectState(`<details open><summary data-test>s</summary></details>`, "expanded", undefined);
  });

  test("aria-busy is true only for the literal value true (https://www.w3.org/TR/wai-aria-1.2/#aria-busy)", () => {
    expectState(`<div data-test aria-busy="true"></div>`, "busy", true);
    expectState(`<div data-test aria-busy="TRUE"></div>`, "busy", false);
    expectState(`<div data-test></div>`, "busy", false);
  });
});

describe("aria-selected — https://www.w3.org/TR/wai-aria-1.2/#aria-selected, https://w3c.github.io/html-aam/#el-option", () => {
  test("<option> uses its selectedness (including the select's default first option)", () => {
    expectState(`<select><option data-test>a</option><option>b</option></select>`, "selected", true);
    expectState(`<select><option>a</option><option data-test>b</option></select>`, "selected", false);
    expectState(`<select><option>a</option><option data-test selected>b</option></select>`, "selected", true);
  });

  test("other elements read aria-selected", () => {
    expectState(`<div data-test role="tab" aria-selected="true"></div>`, "selected", true);
    expectState(`<div data-test role="tab" aria-selected="false"></div>`, "selected", false);
    expectState(`<div data-test role="tab"></div>`, "selected", undefined);
  });
});

describe("aria-level — https://www.w3.org/TR/wai-aria-1.2/#aria-level, https://w3c.github.io/html-aam/#el-h1-h6", () => {
  test("h1–h6 have levels 1–6", () => {
    for (let n = 1; n <= 6; n++) expectState(`<h${n} data-test>h</h${n}>`, "level", n);
  });

  test("aria-level overrides the native level; a non-numeric or zero value is ignored", () => {
    expectState(`<h2 data-test aria-level="5">h</h2>`, "level", 5);
    expectState(`<div data-test role="heading" aria-level="3">h</div>`, "level", 3);
    expectState(`<h2 data-test aria-level="x">h</h2>`, "level", 2);
    expectState(`<h2 data-test aria-level="0">h</h2>`, "level", 2);
    expectState(`<div data-test role="heading">h</div>`, "level", undefined);
  });
});

describe("aria-current — https://www.w3.org/TR/wai-aria-1.2/#aria-current", () => {
  test("true/false are booleans, tokens are returned as strings, absent is false", () => {
    expectState(`<a data-test href="#" aria-current="true">x</a>`, "current", true);
    expectState(`<a data-test href="#" aria-current="false">x</a>`, "current", false);
    expectState(`<a data-test href="#" aria-current="page">x</a>`, "current", "page");
    expectState(`<a data-test href="#" aria-current="step">x</a>`, "current", "step");
    expectState(`<a data-test href="#">x</a>`, "current", false);
  });
});

describe("aria-valuenow — https://www.w3.org/TR/wai-aria-1.2/#aria-valuenow", () => {
  test("parsed as a number; absent is undefined", () => {
    expectState(`<div data-test role="slider" aria-valuenow="42"></div>`, "valueNow", 42);
    expectState(`<div data-test role="slider" aria-valuenow=" 4.5 "></div>`, "valueNow", 4.5);
    expectState(`<div data-test role="slider"></div>`, "valueNow", undefined);
  });
});

describe("disabled — https://w3c.github.io/html-aam/#att-disabled, https://www.w3.org/TR/wai-aria-1.2/#aria-disabled", () => {
  test("the disabled attribute on form controls; aria-disabled=true on anything", () => {
    for (const html of [
      `<button data-test disabled></button>`,
      `<input data-test disabled>`,
      `<select data-test disabled></select>`,
      `<textarea data-test disabled></textarea>`,
      `<fieldset data-test disabled></fieldset>`,
      `<select><optgroup data-test disabled label="g"></optgroup></select>`,
      `<select><option data-test disabled>o</option></select>`,
      `<div data-test aria-disabled="true"></div>`,
    ]) {
      expectState(html, "disabled", true);
    }
    expectState(`<div data-test disabled></div>`, "disabled", false);
    expectState(`<button data-test aria-disabled="false"></button>`, "disabled", false);
  });

  test("oracle: disabledness is not inherited from a disabled fieldset or aria-disabled ancestor", () => {
    // HTML (https://html.spec.whatwg.org/#concept-fe-disabled) disables controls in a disabled
    // fieldset, and aria-disabled applies to descendants; dom-accessibility-api 0.6 checks the
    // element only (jest-dom's toBeDisabled does its own ancestor walk).
    expectState(`<fieldset disabled><input data-test></fieldset>`, "disabled", false);
    expectState(`<div aria-disabled="true"><button data-test></button></div>`, "disabled", false);
  });
});
