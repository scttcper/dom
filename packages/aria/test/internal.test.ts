/**
 * @ctrl/dom/aria internals: version-stamped caches and the NodeImpl-level role filter used by
 * @ctrl/dom/testing-library's `*ByRole`.
 *
 * Specs:
 *   https://w3c.github.io/accname/#computation-steps (names must track DOM + form state)
 *   https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion (hidden must track DOM + style)
 *   https://w3c.github.io/aria/#document-handling_author-errors_roles (role tokens)
 *   https://html.spec.whatwg.org/multipage/forms.html#dom-lfe-labels (label association)
 *   https://html.spec.whatwg.org/multipage/forms.html#labeled-control (labels of ID-less controls)
 */
import { describe, expect, test } from "vitest";
import {
  computeAccessibleName,
  getImplicitRole,
  isInaccessible,
  roleSupportsProp,
  superClassRoles,
  getRoles,
} from "@ctrl/dom/aria";
import { isLabelable, labelMapForTree, labelsOf, tlRoleMatches, tlRole } from "@ctrl/dom/aria/internal";
import { createWindow, type Element } from "@ctrl/dom";
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

  test("moving a control out of its label re-associates it", () => {
    renderIntoDocument('<div id="a"><label>A <input id="x"></label></div><div id="b"></div>');
    expect(computeAccessibleName($("#x"))).toBe("A");
    $("#b").appendChild($("#x"));
    expect(computeAccessibleName($("#x"))).toBe("");
  });
});

// labelsOf finds ancestor labels and the document's connected labels with `for`
// (Document[$forLabels]); labelMapForTree walks the whole tree and is the oracle.
describe("labels without walking the tree — https://html.spec.whatwg.org/multipage/forms.html#labeled-control", () => {
  const labelText = (el: Element) => labelsOf(impl(el))!.map((l) => (l.node as unknown as Element).textContent);

  test("an ancestor label without for labels its first labelable descendant only", () => {
    renderIntoDocument("<label>L <button>a</button><button>b</button></label>");
    const [a, b] = document.querySelectorAll("button") as unknown as Element[];
    expect(labelText(a)).toEqual(["L ab"]);
    expect(labelText(b)).toEqual([]);
  });

  test("an ancestor label with for labels its target, not the descendant", () => {
    renderIntoDocument('<label for="t">L <button>a</button></label><input id="t">');
    expect(labelText($("button"))).toEqual([]);
    expect(labelText($("#t"))).toEqual(["L a"]);
  });

  test("nested labels are listed outermost first, each only if the control is its first labelable descendant", () => {
    renderIntoDocument("<label>Outer <label>Inner <button>a</button></label></label>");
    expect(labelText($("button"))).toEqual(["Outer Inner a", "Inner a"]);
  });

  const matchesTreeWalk = (root: Element) => {
    const map = labelMapForTree(impl(root));
    for (const el of root.querySelectorAll("*") as unknown as Element[]) {
      const n = impl(el);
      if (isLabelable(n)) expect(labelsOf(n)).toEqual(map.get(n) ?? []);
    }
  };

  test("matches a walk of the tree for every labelable element", () => {
    renderIntoDocument(
      '<label>A <input><input></label><label for="x">B <button></button></label><select id="x"></select>' +
        '<label>C <span><textarea></textarea></span></label><label><label for="">D <meter></meter></label></label>' +
        '<label>E <input type="hidden"><output></output></label><label for="y">F</label><label for="y">G</label>' +
        '<label>H <input id="y"></label><input id="y"><label for="z">I <input id="z"></label>',
    );
    matchesTreeWalk(document.body as unknown as Element);
  });

  test("follows for, id and tree changes", () => {
    renderIntoDocument('<div id="box"><input id="p"><button id="q"></button></div><label id="l" for="p">L</label>');
    const body = document.body as unknown as Element;
    matchesTreeWalk(body);
    $("#l").setAttribute("for", "q");
    matchesTreeWalk(body);
    $("#q").setAttribute("id", "p");
    matchesTreeWalk(body);
    $("#box").prepend($("#l"));
    matchesTreeWalk(body);
    $("#l").removeAttribute("for");
    matchesTreeWalk(body);
    $("#box").remove();
    matchesTreeWalk(body);
  });

  test("a detached tree and a shadow tree resolve for within themselves", () => {
    renderIntoDocument('<input id="x"><div id="host"></div>');
    const detached = document.createElement("div");
    detached.innerHTML = '<label for="x">D</label><input id="x">';
    matchesTreeWalk(detached);
    const shadow = ($("#host") as unknown as { attachShadow(o: object): Element }).attachShadow({ mode: "open" });
    shadow.innerHTML = '<label for="x">S</label><input id="x">';
    matchesTreeWalk(shadow);
    expect(labelText($("#x"))).toEqual([]);
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
    renderIntoDocument(
      '<div style="visibility:hidden"><span id="s">a</span><span id="v" style="visibility:visible">b</span></div>',
    );
    expect(isInaccessible($("#s"))).toBe(true);
    expect(isInaccessible($("#v"))).toBe(false);
  });

  test("getRoles skips inaccessible elements unless hidden: true", () => {
    renderIntoDocument("<button>a</button><div hidden><button>b</button></div>");
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

  test("an element with a role attribute still answers its implicit role", () => {
    renderIntoDocument('<input id="s" role="switch" type="checkbox">');
    expect(tlRoleMatches(impl($("#s")), "switch", false)).toBe(true);
    expect(getImplicitRole($("#s"))).toBe("checkbox");
  });
});

describe("caches across documents — https://dom.spec.whatwg.org/#concept-node-adopt", () => {
  // Two windows build the same initial tree, so per-document mutation counts would line up: a
  // cache stamp taken in one document must never match the other document's version.
  test("a role cached in one document is recomputed after the element moves to another", () => {
    const a = createWindow().document;
    const b = createWindow().document;
    const el = a.createElement("input");
    el.setAttribute("type", "text");
    expect(getImplicitRole(el)).toBe("textbox");
    el.setAttribute("type", "checkbox");
    b.body!.append(el);
    expect(getImplicitRole(el)).toBe("checkbox");
    expect(tlRoleMatches(impl(el), "checkbox", false)).toBe(true);
  });

  test("a name cached in one document is recomputed after the element moves to another", () => {
    const a = createWindow().document;
    const b = createWindow().document;
    const el = a.createElement("button");
    el.setAttribute("aria-label", "Old");
    expect(computeAccessibleName(el)).toBe("Old");
    el.setAttribute("aria-label", "New");
    b.body!.append(el);
    expect(computeAccessibleName(el)).toBe("New");
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
