/**
 * @ctrl/dom/aria internals: version-stamped caches and the NodeImpl-level role filter used by
 * @ctrl/dom/testing-library's `*ByRole`.
 *
 * Specs:
 *   https://w3c.github.io/accname/#computation-steps (names must track DOM + form state)
 *   https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion (hidden must track DOM + style)
 *   https://w3c.github.io/aria/#document-handling_author-errors_roles (role tokens)
 *   https://html.spec.whatwg.org/multipage/forms.html#dom-lfe-labels (label association)
 */
import { describe, expect, test } from "vitest";
import { computeAccessibleName, getImplicitRole, isInaccessible, roleSupportsProp, superClassRoles, getRoles } from "@ctrl/dom/aria";
import { tlRoleMatches, tlRole } from "@ctrl/dom/aria/internal";
import type { Element } from "@ctrl/dom";
import { makeDocument } from "./helpers.ts";
import { $impl } from "@ctrl/dom/internal";

const { document, renderIntoDocument } = makeDocument();
const $ = (sel: string) => document.querySelector(sel) as Element;
const impl = (el: Element) => (el as unknown as { [$impl]: never })[$impl];

describe("name cache invalidation — https://w3c.github.io/accname/#computation-steps", () => {
  test("a text change in a label recomputes the labelled control's name", () => {
    renderIntoDocument('<label for="i">Old</label><input id="i">');
    expect(computeAccessibleName($("#i"))).toBe("Old");
    $("label").textContent = "New";
    expect(computeAccessibleName($("#i"))).toBe("New");
  });

  test("an attribute change (aria-label) recomputes the name", () => {
    renderIntoDocument('<button aria-label="One">x</button>');
    expect(computeAccessibleName($("button"))).toBe("One");
    $("button").setAttribute("aria-label", "Two");
    expect(computeAccessibleName($("button"))).toBe("Two");
  });

  test("a value change of an embedded control is seen (dynamic state is never cached)", () => {
    renderIntoDocument('<label for="c">Qty <input id="q" value="1"> items</label><input type="checkbox" id="c">');
    expect(computeAccessibleName($("#c"))).toBe("Qty 1 items");
    ($("#q") as unknown as { value: string }).value = "5";
    expect(computeAccessibleName($("#c"))).toBe("Qty 5 items");
  });

  test("an inline style change hides content from the name", () => {
    renderIntoDocument("<button>Visible <span>extra</span></button>");
    expect(computeAccessibleName($("button"))).toBe("Visible extra");
    $("span").setAttribute("style", "display: none");
    expect(computeAccessibleName($("button"))).toBe("Visible");
  });

  test("moving a label re-associates it (label index keyed by document version)", () => {
    renderIntoDocument('<div id="a"><label>A <input id="x"></label></div><div id="b"></div>');
    expect(computeAccessibleName($("#x"))).toBe("A");
    $("#b").appendChild($("#x"));
    expect(computeAccessibleName($("#x"))).toBe("");
  });
});

describe("hidden cache — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion", () => {
  test("ancestor aria-hidden toggles are observed by descendants", () => {
    renderIntoDocument('<main><section><p><button id="b">x</button></p></section></main>');
    expect(isInaccessible($("#b"))).toBe(false);
    $("section").setAttribute("aria-hidden", "true");
    expect(isInaccessible($("#b"))).toBe(true);
    $("section").setAttribute("aria-hidden", "false");
    expect(isInaccessible($("#b"))).toBe(false);
  });

  test("inherited visibility: hidden and a visible override", () => {
    renderIntoDocument('<div style="visibility:hidden"><span id="s">a</span><span id="v" style="visibility:visible">b</span></div>');
    expect(isInaccessible($("#s"))).toBe(true);
    expect(isInaccessible($("#v"))).toBe(false);
  });

  test("getRoles skips inaccessible elements unless hidden: true", () => {
    renderIntoDocument('<button>a</button><div hidden><button>b</button></div>');
    expect(getRoles(document.body!).button).toHaveLength(1);
    expect(getRoles(document.body!, { hidden: true }).button).toHaveLength(2);
  });
});

describe("Testing Library role filter — https://w3c.github.io/aria/#document-handling_author-errors_roles", () => {
  test("first token only without queryFallbacks; any token with it", () => {
    renderIntoDocument('<div id="d" role="switch button">x</div>');
    const n = impl($("#d"));
    expect(tlRoleMatches(n, "switch", false)).toBe(true);
    expect(tlRoleMatches(n, "button", false)).toBe(false);
    expect(tlRoleMatches(n, "button", true)).toBe(true);
    expect(tlRoleMatches(n, "butto", true)).toBe(false);
    expect(tlRole(n)).toBe("switch");
  });

  test("an explicit role attribute disables implicit matching (even an empty one)", () => {
    renderIntoDocument('<button id="b" role="">x</button><button id="c">y</button>');
    expect(tlRoleMatches(impl($("#b")), "button", false)).toBe(false);
    expect(tlRoleMatches(impl($("#c")), "button", false)).toBe(true);
    expect(getImplicitRole($("#c"))).toBe("button");
  });
});

describe("aria-query data helpers — https://www.w3.org/TR/wai-aria-1.2/#role_definitions", () => {
  test("roleSupportsProp mirrors `roles.get(role)?.props[prop] !== undefined`", () => {
    expect(roleSupportsProp("checkbox", "aria-checked")).toBe(true);
    expect(roleSupportsProp("button", "aria-checked")).toBe(false);
    expect(roleSupportsProp("button", "aria-pressed")).toBe(true);
    expect(roleSupportsProp("nope", "aria-pressed")).toBe(false);
  });

  test("superClassRoles walks the superClass chains", () => {
    expect(superClassRoles("checkbox")).toEqual(expect.arrayContaining(["input", "widget", "roletype"]));
  });
});
