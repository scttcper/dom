/**
 * Excluding elements from the accessibility tree (Testing Library's `isInaccessible`, what
 * `*ByRole` uses unless `hidden: true`).
 *
 * Specs:
 *   WAI-ARIA 1.2 §7.1 "Excluding Elements from the Accessibility Tree" — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion
 *   HTML §15.3.1 "Hidden elements" (UA display:none rules) — https://html.spec.whatwg.org/#hidden-elements
 *   CSS Display §2.5 visibility (inherited) — https://drafts.csswg.org/css-display/#visibility
 *
 * Every assertion runs on both engines (helpers.ts `both`): @ctrl/dom/aria on @ctrl/dom and
 * Testing Library 10.4.2 / dom-accessibility-api@0.5.16 on jsdom. Tests prefixed "oracle:"
 * pin where that implementation is narrower than the spec.
 */
import { describe, expect, test } from "vitest";
import { both, testNode } from "./helpers.ts";

function expectInaccessible(html: string, expected: boolean): void {
  expect(both(html, (api, doc) => api.inaccessible(testNode(doc)))).toEqual({ "ctrl-dom": expected, upstream: expected });
}

describe("display: none — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion", () => {
  test("on the element or any ancestor, inline or from a style sheet", () => {
    expectInaccessible(`<button data-test style="display:none">x</button>`, true);
    expectInaccessible(`<div style="display:none"><p><button data-test>x</button></p></div>`, true);
    expectInaccessible(`<style>.gone { display: none }</style><div class="gone"><button data-test>x</button></div>`, true);
    expectInaccessible(`<style>.gone { display: none }</style><button data-test>x</button>`, false);
  });

  test("a descendant cannot override an ancestor's display:none", () => {
    expectInaccessible(`<div style="display:none"><button data-test style="display:block">x</button></div>`, true);
  });

  test("UA hidden elements are excluded: input type=hidden, a closed dialog, [hidden] (https://html.spec.whatwg.org/#hidden-elements)", () => {
    expectInaccessible(`<input data-test type="hidden">`, true);
    expectInaccessible(`<dialog><button data-test>x</button></dialog>`, true);
    expectInaccessible(`<dialog open><button data-test>x</button></dialog>`, false);
  });

  test("an author display value overrides the UA [hidden] rule only for display, not for the hidden check", () => {
    // isSubtreeInaccessible tests `element.hidden` directly, so display:block does not reveal it.
    expectInaccessible(`<div hidden style="display:block"><button data-test>x</button></div>`, true);
  });
});

describe("visibility — https://drafts.csswg.org/css-display/#visibility", () => {
  test("visibility:hidden excludes the element and is inherited by descendants", () => {
    expectInaccessible(`<button data-test style="visibility:hidden">x</button>`, true);
    expectInaccessible(`<div style="visibility:hidden"><button data-test>x</button></div>`, true);
  });

  test("a descendant with visibility:visible is exposed again", () => {
    expectInaccessible(`<div style="visibility:hidden"><button data-test style="visibility:visible">x</button></div>`, false);
  });

  test("oracle: visibility:collapse is not treated as hidden", () => {
    expectInaccessible(`<button data-test style="visibility:collapse">x</button>`, false);
  });

  test("opacity:0 and zero size do not exclude (no layout)", () => {
    expectInaccessible(`<button data-test style="opacity:0">x</button>`, false);
    expectInaccessible(`<button data-test style="width:0;height:0;overflow:hidden">x</button>`, false);
  });
});

describe("hidden attribute and aria-hidden — https://www.w3.org/TR/wai-aria-1.2/#aria-hidden", () => {
  test("hidden on the element or an ancestor; hidden=until-found too", () => {
    expectInaccessible(`<button data-test hidden>x</button>`, true);
    expectInaccessible(`<section hidden><button data-test>x</button></section>`, true);
    expectInaccessible(`<div hidden="until-found"><button data-test>x</button></div>`, true);
  });

  test("aria-hidden=true on the element or an ancestor; a descendant's aria-hidden=false does not re-expose", () => {
    expectInaccessible(`<button data-test aria-hidden="true">x</button>`, true);
    expectInaccessible(`<div aria-hidden="true"><button data-test aria-hidden="false">x</button></div>`, true);
    expectInaccessible(`<button data-test aria-hidden="false">x</button>`, false);
  });

  test("only the literal (lower-case) true hides", () => {
    expectInaccessible(`<button data-test aria-hidden="TRUE">x</button>`, false);
    expectInaccessible(`<button data-test aria-hidden="">x</button>`, false);
  });

  test("isSubtreeInaccessible looks at the element only (hidden, aria-hidden, display:none)", () => {
    const probe = (html: string) => both(html, (api, doc) => api.subtreeInaccessible(testNode(doc)));
    expect(probe(`<div aria-hidden="true"><b data-test>x</b></div>`)).toEqual({ "ctrl-dom": false, upstream: false });
    expect(probe(`<b data-test style="display:none">x</b>`)).toEqual({ "ctrl-dom": true, upstream: true });
    expect(probe(`<b data-test style="visibility:hidden">x</b>`)).toEqual({ "ctrl-dom": false, upstream: false });
  });
});

describe("inert — https://html.spec.whatwg.org/#the-inert-attribute", () => {
  test("oracle: inert subtrees are not excluded from the accessibility tree", () => {
    // Browsers hide inert content from assistive technology; Testing Library does not, so
    // `*ByRole` still finds elements that React Aria / Radix mark inert outside a modal
    // (docs/deviations.md, "HTMLElement: inert").
    expectInaccessible(`<div inert><button data-test>x</button></div>`, false);
  });
});

describe("getRoles honors exclusion — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion", () => {
  test("excluded elements are listed only with hidden: true", () => {
    const html = `<button data-id="v">v</button><button data-id="h" style="visibility:hidden">h</button><div style="display:none"><button data-id="n">n</button></div>`;
    expect(both(html, (api, doc) => api.roles(doc.body))).toEqual({ "ctrl-dom": { button: ["v"] }, upstream: { button: ["v"] } });
    expect(both(html, (api, doc) => api.roles(doc.body, { hidden: true }))).toEqual({
      "ctrl-dom": { button: ["v", "h", "n"] },
      upstream: { button: ["v", "h", "n"] },
    });
  });
});
