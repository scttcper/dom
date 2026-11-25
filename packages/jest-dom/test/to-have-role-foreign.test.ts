/**
 * toHaveRole on elements of a foreign DOM (jsdom): @ctrl/dom/jest-dom answers from
 * src/element-roles.generated.ts, upstream's element role list precompiled from aria-query@5.3.2
 * (scripts/gen-element-roles.ts) and expanded on first use. The default run never exercises it
 * (its elements are @ctrl/dom's), so this test builds a jsdom element for every elementRoles
 * concept, plus probes for absent attributes, the `type` default and attribute value case, and
 * compares every role's answer with stock @testing-library/jest-dom@7.0.1 on the same element.
 *
 * Upstream: https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-role.js
 * Specs: HTML-AAM element role mappings — https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings
 */
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import * as stock from "@testing-library/jest-dom/matchers";
import { toHaveRole } from "../src/matchers.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
// aria-query as stock jest-dom resolves it (5.3.2), the version the table was generated from.
const ariaQuery = createRequire(createRequire(import.meta.url).resolve("@testing-library/jest-dom/package.json"))(
  "aria-query",
);

const document: any = new JSDOM("<!doctype html><html><body></body></html>").window.document;

function element(name: string, attributes: Record<string, string>): any {
  const el = document.createElement(name);
  for (const [attr, value] of Object.entries(attributes)) el.setAttribute(attr, value);
  return el;
}

/** One element per elementRoles concept: valued attributes set, bare ones present, "undefined" ones absent. */
function conceptElements(): any[] {
  const out: any[] = [];
  for (const [concept] of ariaQuery.elementRoles.entries()) {
    const attrs: Record<string, string> = {};
    for (const a of concept.attributes ?? []) {
      if ((a.constraints ?? []).includes("undefined")) continue;
      attrs[a.name] = a.value ?? "";
    }
    out.push(element(concept.name, attrs));
  }
  return out;
}

// oxfmt-ignore
const PROBES: [string, Record<string, string>][] = [
  ["input", {}], ["input", { type: "TEXT" }], ["input", { type: "CHECKBOX" }], ["input", { type: "Search", list: "l" }],
  ["input", { type: "bogus" }], ["input", { list: "l" }], ["input", { type: "image", alt: "" }],
  ["select", {}], ["select", { size: "1" }], ["select", { multiple: "" }], ["select", { multiple: "", size: "4" }],
  ["img", {}], ["img", { alt: "" }], ["img", { alt: "x" }],
  ["th", {}], ["th", { scope: "COL" }], ["th", { scope: "row" }], ["td", {}],
  ["a", {}], ["area", {}], ["form", {}], ["form", { name: "f" }], ["section", {}], ["section", { "aria-label": "s" }],
  ["aside", {}], ["header", {}], ["footer", {}], ["div", {}], ["span", { role: "button" }], ["math", {}],
];

const ALL_ROLES = [...new Set<string>(ariaQuery.elementRoles.values().flatMap((roles: Set<string>) => [...roles]))];

const context: any = { isNot: false, promise: "", utils: {} };

function rolesOf(matcher: (this: any, el: any, role: string) => { pass: boolean }, el: any): string[] {
  return ALL_ROLES.filter((role) => matcher.call(context, el, role).pass);
}

describe("toHaveRole on foreign elements — https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings", () => {
  const elements = [...conceptElements(), ...PROBES.map(([name, attrs]) => element(name, attrs))];

  test("covers every elementRoles concept of aria-query@5.3.2", () => {
    expect(conceptElements().length).toBe(ariaQuery.elementRoles.entries().length);
  });

  test.each(elements.map((el) => [el.outerHTML, el]))("%s has the roles stock jest-dom@7.0.1 reports", (_html, el) => {
    expect(rolesOf(toHaveRole as any, el)).toEqual(rolesOf((stock as any).toHaveRole, el));
  });
});
