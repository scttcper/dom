/**
 * Differential tests: @rtd/testing-library on @rtd/dom vs stock @testing-library/dom@10.4.2
 * on jsdom. Every scenario renders the same markup into both DOMs, runs the same calls on
 * both libraries and compares the observable results: matched elements (by outerHTML), thrown
 * error names/messages (including the prettyDOM dump inside them), printed output.
 *
 * Spec of record: the stock library's behavior (https://github.com/testing-library/dom-testing-library).
 */

import { describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import * as stock from "@testing-library/dom";
import * as ours from "../../src/index.ts";

type Lib = typeof stock;

interface Scenario {
  name: string;
  html: string;
  run: (lib: Lib, container: any) => unknown;
}

function jsdomContainer(html: string): any {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="root">${html}</div></body></html>`);
  return dom.window.document.getElementById("root");
}

function rtdContainer(html: string): any {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById("root");
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object" && typeof (value as any).nodeType === "number") {
    const node = value as any;
    return node.nodeType === 1 ? `<el> ${node.outerHTML}` : `<node ${node.nodeType}> ${node.textContent}`;
  }
  if (typeof value === "object" && typeof (value as any).toString === "function" && "queryMethod" in (value as any)) {
    const s = value as any;
    return { queryName: s.queryName, queryMethod: s.queryMethod, variant: s.variant, string: s.toString() };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) out[k] = normalize(v);
    return out;
  }
  return value;
}

function outcome(lib: Lib, container: any, run: Scenario["run"]): unknown {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const result = run(lib, container);
    return { result: normalize(result), logs: log.mock.calls.map((c) => c.join(" ")) };
  } catch (e: any) {
    return { error: { name: e?.name, message: e?.message }, logs: log.mock.calls.map((c) => c.join(" ")) };
  } finally {
    log.mockRestore();
    warn.mockRestore();
  }
}

function differential(scenarios: Scenario[]): void {
  for (const s of scenarios) {
    test(s.name, () => {
      const expected = outcome(stock, jsdomContainer(s.html), s.run);
      const actual = outcome(ours as unknown as Lib, rtdContainer(s.html), s.run);
      expect(actual).toEqual(expected);
    });
  }
}

const FORM = `
  <form aria-label="Sign up">
    <h1>Create account</h1>
    <label for="first">First name</label><input id="first" placeholder="Jane" />
    <label>Last name <input id="last" value="Doe" /></label>
    <span id="email-label">Email</span><input aria-labelledby="email-label" type="email" />
    <input aria-label="Phone" type="tel" />
    <label for="terms"><input type="checkbox" id="terms" checked /> I agree</label>
    <select aria-label="Country"><option>Norway</option><option selected>Sweden</option></select>
    <textarea title="Bio">Hello there</textarea>
    <img src="a.png" alt="Avatar" />
    <button type="submit" data-testid="submit">Create</button>
    <button type="button" disabled>Cancel</button>
    <div role="alert" hidden>Hidden alert</div>
    <div aria-hidden="true"><button>Ghost</button></div>
    <a href="/x">Home link</a>
    <ul><li>One</li><li>Two</li></ul>
    <!-- a comment -->
    <script>var x = "<b>";</script>
    <style>.a { color: red }</style>
  </form>
`;

describe("ByText", () => {
  differential([
    { name: "exact match", html: FORM, run: (l, c) => l.getByText(c, "Home link") },
    { name: "regex, multiple", html: FORM, run: (l, c) => l.getAllByText(c, /o/) },
    { name: "fuzzy", html: FORM, run: (l, c) => l.getAllByText(c, "ONE", { exact: false }) },
    { name: "function matcher", html: FORM, run: (l, c) => l.queryAllByText(c, (content, el) => el?.tagName === "LI" && content.length > 2) },
    { name: "selector", html: FORM, run: (l, c) => l.getAllByText(c, /./, { selector: "li" }) },
    { name: "ignore false includes script", html: FORM, run: (l, c) => l.queryAllByText(c, /var x/, { ignore: false }) },
    { name: "default ignore skips script", html: FORM, run: (l, c) => l.queryAllByText(c, /var x/) },
    { name: "missing (error + DOM dump)", html: FORM, run: (l, c) => l.getByText(c, "Nope") },
    { name: "missing normalized", html: FORM, run: (l, c) => l.getByText(c, "  Nope   here ") },
    { name: "multiple error", html: FORM, run: (l, c) => l.getByText(c, /o/i) },
    { name: "button inputs use value", html: `<input type="submit" value="Send"><input type="BUTTON" value="Go">`, run: (l, c) => l.getAllByText(c, /Send|Go/) },
    { name: "container itself matches", html: "x", run: (l, c) => l.getAllByText(c.firstChild ? c : c, "x") },
    { name: "whitespace normalization", html: "<p>  a \n\t b  </p>", run: (l, c) => l.getByText(c, "a b") },
    { name: "no collapse", html: "<p>a  b</p>", run: (l, c) => l.queryByText(c, "a  b", { collapseWhitespace: false }) },
  ]);
});

describe("ByLabelText", () => {
  differential([
    { name: "for/id", html: FORM, run: (l, c) => l.getByLabelText(c, "First name") },
    { name: "wrapping label", html: FORM, run: (l, c) => l.getByLabelText(c, "Last name") },
    { name: "aria-labelledby", html: FORM, run: (l, c) => l.getByLabelText(c, "Email") },
    { name: "aria-label", html: FORM, run: (l, c) => l.getByLabelText(c, "Phone") },
    { name: "checkbox label with text after", html: FORM, run: (l, c) => l.getByLabelText(c, /agree/) },
    { name: "regex many", html: FORM, run: (l, c) => l.getAllByLabelText(c, /name/i) },
    { name: "selector", html: FORM, run: (l, c) => l.queryAllByLabelText(c, /name/i, { selector: "#last" }) },
    { name: "missing", html: FORM, run: (l, c) => l.getByLabelText(c, "Nope") },
    { name: "label without control", html: `<label>Orphan</label>`, run: (l, c) => l.getByLabelText(c, "Orphan") },
    { name: "label for non-labellable", html: `<label for="d">Div label</label><div id="d"></div>`, run: (l, c) => l.getByLabelText(c, "Div label") },
    {
      name: "multiple labels",
      html: `<label for="m">A</label><label for="m">B</label><label for="m">C</label><input id="m">`,
      run: (l, c) => [l.getAllByLabelText(c, "A B C"), l.getAllByLabelText(c, "B"), l.getAllByLabelText(c, "A C")],
    },
    { name: "multiple labelledby ids", html: `<span id="a">Foo</span><span id="b">Bar</span><input aria-labelledby="a b">`, run: (l, c) => l.getByLabelText(c, "Foo Bar") },
    { name: "hidden input not labelable", html: `<label for="h">Hidden</label><input type="hidden" id="h">`, run: (l, c) => l.queryAllByLabelText(c, "Hidden") },
    { name: "label content skips control text", html: `<label>Pick <select><option>X</option></select> one</label>`, run: (l, c) => l.getByLabelText(c, "Pick  one", { normalizer: (s) => s }) },
  ]);
});

describe("ByRole", () => {
  differential([
    { name: "button by name", html: FORM, run: (l, c) => l.getByRole(c, "button", { name: "Create" }) },
    { name: "all buttons (hidden excluded)", html: FORM, run: (l, c) => l.getAllByRole(c, "button") },
    { name: "hidden: true", html: FORM, run: (l, c) => l.getAllByRole(c, "button", { hidden: true }) },
    { name: "textboxes", html: FORM, run: (l, c) => l.getAllByRole(c, "textbox") },
    { name: "heading level", html: FORM, run: (l, c) => l.getByRole(c, "heading", { level: 1 }) },
    { name: "checkbox checked", html: FORM, run: (l, c) => l.getByRole(c, "checkbox", { checked: true }) },
    { name: "combobox name", html: FORM, run: (l, c) => l.getByRole(c, "combobox", { name: "Country" }) },
    { name: "option selected", html: FORM, run: (l, c) => l.getByRole(c, "option", { selected: true }) },
    { name: "link", html: FORM, run: (l, c) => l.getByRole(c, "link", { name: /home/i }) },
    { name: "listitems", html: FORM, run: (l, c) => l.getAllByRole(c, "listitem") },
    { name: "form by aria-label", html: FORM, run: (l, c) => l.getByRole(c, "form", { name: "Sign up" }) },
    { name: "img", html: FORM, run: (l, c) => l.getByRole(c, "img", { name: "Avatar" }) },
    { name: "missing role lists accessible roles", html: FORM, run: (l, c) => l.getByRole(c, "dialog") },
    { name: "missing name", html: FORM, run: (l, c) => l.getByRole(c, "button", { name: "Nope" }) },
    { name: "missing with hidden: true", html: `<div hidden><button>x</button></div>`, run: (l, c) => l.getByRole(c, "link", { hidden: true }) },
    { name: "no accessible roles", html: `<div aria-hidden="true"><button>x</button></div>`, run: (l, c) => l.getByRole(c, "button") },
    { name: "multiple error", html: FORM, run: (l, c) => l.getByRole(c, "textbox") },
    { name: "explicit role first token", html: `<div role="button link">x</div><div role="link button">y</div>`, run: (l, c) => l.getAllByRole(c, "button") },
    { name: "queryFallbacks", html: `<div role="button link">x</div><div role="link button">y</div>`, run: (l, c) => l.getAllByRole(c, "link", { queryFallbacks: true }) },
    { name: "unsupported state throws", html: FORM, run: (l, c) => l.getByRole(c, "link", { checked: true }) },
    { name: "level on non-heading throws", html: FORM, run: (l, c) => l.getByRole(c, "button", { level: 2 }) },
    { name: "pressed", html: `<button aria-pressed="true">B</button><button aria-pressed="false">I</button>`, run: (l, c) => l.getByRole(c, "button", { pressed: false }) },
    { name: "expanded", html: `<button aria-expanded="true">a</button><button>b</button>`, run: (l, c) => l.getAllByRole(c, "button", { expanded: true }) },
    { name: "current", html: `<a href="#" aria-current="page">a</a><a href="#">b</a>`, run: (l, c) => [l.getByRole(c, "link", { current: "page" }), l.getByRole(c, "link", { current: false })] },
    {
      name: "value",
      html: `<div role="slider" aria-valuenow="5" aria-valuemin="0" aria-valuemax="10" aria-valuetext="five"></div>`,
      run: (l, c) => [l.getByRole(c, "slider", { value: { now: 5, min: 0, max: 10 } }), l.getByRole(c, "slider", { value: { text: /fi/ } })],
    },
    { name: "description", html: `<button aria-describedby="d">x</button><p id="d">Deletes it</p>`, run: (l, c) => l.getByRole(c, "button", { description: "Deletes it" }) },
    { name: "missing description lists descriptions", html: `<button aria-describedby="d">x</button><p id="d">Deletes it</p>`, run: (l, c) => l.getByRole(c, "button", { description: "nope" }) },
    { name: "display:none inline style", html: `<div style="display: none"><button>a</button></div><button>b</button>`, run: (l, c) => l.getAllByRole(c, "button") },
    { name: "visibility hidden", html: `<div style="visibility: hidden"><button>a</button></div><button>b</button>`, run: (l, c) => l.getAllByRole(c, "button") },
    { name: "name function", html: FORM, run: (l, c) => l.getAllByRole(c, "button", { name: (n: string) => n.startsWith("C") }) },
  ]);
});

describe("other queries", () => {
  differential([
    { name: "test id", html: FORM, run: (l, c) => l.getByTestId(c, "submit") },
    { name: "test id regex", html: `<i data-testid="a1"></i><i data-testid="a2"></i>`, run: (l, c) => l.getAllByTestId(c, /a\d/) },
    { name: "test id missing", html: FORM, run: (l, c) => l.getByTestId(c, "nope") },
    { name: "test id multiple", html: `<i data-testid="a"></i><i data-testid="a"></i>`, run: (l, c) => l.getByTestId(c, "a") },
    { name: "placeholder", html: FORM, run: (l, c) => l.getByPlaceholderText(c, "Jane") },
    { name: "alt text", html: FORM + `<div alt="Avatar"></div><x-img alt="Avatar"></x-img>`, run: (l, c) => l.getAllByAltText(c, "Avatar") },
    { name: "title", html: FORM + `<svg><title>Bio</title></svg>`, run: (l, c) => l.getAllByTitle(c, "Bio") },
    { name: "display value input", html: FORM, run: (l, c) => l.getByDisplayValue(c, "Doe") },
    { name: "display value select", html: FORM, run: (l, c) => l.getByDisplayValue(c, "Sweden") },
    { name: "display value textarea", html: FORM, run: (l, c) => l.getByDisplayValue(c, "Hello there") },
    { name: "queryByAttribute", html: `<div data-foo="bar"></div><div data-foo="rubar"></div>`, run: (l, c) => [l.queryByAttribute("data-foo", c, "bar"), l.queryAllByAttribute("data-foo", c, /bar/)] },
    { name: "within", html: FORM, run: (l, c) => l.within(c.querySelector("ul")).getAllByRole("listitem") },
    { name: "getNodeText", html: `<p>a<!--x-->b<span>c</span>d</p>`, run: (l, c) => l.getNodeText(c.firstChild) },
  ]);
});

describe("suggestions", () => {
  differential([
    { name: "getSuggestedQuery button", html: FORM, run: (l, c) => l.getSuggestedQuery(c.querySelector("button")) },
    { name: "getSuggestedQuery input", html: FORM, run: (l, c) => l.getSuggestedQuery(c.querySelector("#first"), "query") },
    { name: "getSuggestedQuery div text", html: `<div>Just text</div>`, run: (l, c) => l.getSuggestedQuery(c.firstChild, "get") },
    { name: "getSuggestedQuery by method", html: FORM, run: (l, c) => l.getSuggestedQuery(c.querySelector("[data-testid]"), "get", "TestId") },
    { name: "throw suggestions", html: FORM, run: (l, c) => l.getByTestId(c, "submit", { suggest: true } as any) },
    { name: "suggest hidden", html: `<div aria-hidden="true"><button>x</button></div>`, run: (l, c) => l.getSuggestedQuery(c.querySelector("button")) },
  ]);
});

describe("roles + printing", () => {
  differential([
    { name: "logRoles", html: FORM, run: (l, c) => l.logRoles(c) },
    { name: "getRoles keys", html: FORM, run: (l, c) => Object.keys(l.getRoles(c)) },
    { name: "isInaccessible", html: FORM, run: (l, c) => Array.from(c.querySelectorAll("button")).map((b: any) => l.isInaccessible(b)) },
    { name: "prettyDOM default", html: FORM, run: (l, c) => l.prettyDOM(c) },
    { name: "prettyDOM no highlight", html: FORM, run: (l, c) => l.prettyDOM(c, undefined, { highlight: false }) },
    { name: "prettyDOM maxLength", html: FORM, run: (l, c) => l.prettyDOM(c, 100) },
    { name: "prettyDOM min", html: FORM, run: (l, c) => l.prettyDOM(c, undefined, { min: true, highlight: false }) },
    { name: "prettyDOM maxDepth", html: FORM, run: (l, c) => l.prettyDOM(c, undefined, { maxDepth: 2, highlight: false }) },
    { name: "prettyDOM filterNode", html: FORM, run: (l, c) => l.prettyDOM(c, undefined, { filterNode: () => true, highlight: false }) },
    { name: "prettyDOM escaping", html: `<p title='a"b\\c'>1 &lt; 2 &amp;&gt;</p>`, run: (l, c) => l.prettyDOM(c, undefined, { highlight: false }) },
    { name: "prettyDOM svg", html: `<svg viewBox="0 0 1 1"><linearGradient id="g"/><circle r="1"/></svg>`, run: (l, c) => l.prettyDOM(c, undefined, { highlight: false }) },
    { name: "prettyDOM fragment child", html: `<template><b>x</b></template>`, run: (l, c) => l.prettyDOM(c.firstChild.content.firstChild) },
    { name: "prettyDOM invalid", html: "", run: (l) => l.prettyDOM({} as any) },
  ]);
});
