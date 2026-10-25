/**
 * Differential tests: a user-replaced `window.getComputedStyle` (Sentry's Jest setup replaces
 * it with `el => el.style`) as dom-accessibility-api and Testing Library's role helpers see it.
 *
 * Oracle, on jsdom with the same replacement:
 *   - dom-accessibility-api@0.5.16 / 0.6.3: `isInaccessible` / `isSubtreeInaccessible` default
 *     to `element.ownerDocument.defaultView.getComputedStyle`
 *     (https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/is-inaccessible.ts);
 *     `computeAccessibleName` / `computeAccessibleDescription` default to
 *     `window.getComputedStyle.bind(window)` with `computedStyleSupportsPseudoElements: false`
 *     (https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/accessible-name-and-description.ts);
 *   - @testing-library/dom@10.4.2 role-helpers `getRoles` (isInaccessible per element).
 *
 * Specs: https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion, https://w3c.github.io/accname/#step2A,
 *        https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import * as ctrlDom from "@ctrl/dom/aria";
import { loadOracle } from "./helpers.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const O = loadOracle();

const HTML = `
  <style>.gone { display: none } .ghost { visibility: hidden } .ghost::before { content: "pre" }</style>
  <ul role="tablist">
    <li role="tab">Details</li>
    <li role="tab" class="gone">Attachments</li>
    <li role="tab" class="ghost">Activity</li>
    <li role="tab" style="display: none">Inline hidden</li>
    <li role="tab" hidden>Attr hidden</li>
  </ul>
  <div class="gone"><button aria-describedby="d">Inside gone</button></div>
  <button>Save <span class="ghost">draft</span><span class="gone"> now</span></button>
  <p id="d">Desc <span class="gone">hidden by sheet</span></p>
`;

const replaced = (el: any) => el.style;

function evaluate(doc: any, aria: { daa05: any; daa06: any; getRoles: (c: any) => Record<string, any[]> }) {
  const all = [...doc.body.querySelectorAll("*")] as any[];
  return {
    perElement: all.map((el) => ({
      tag: el.localName,
      inaccessible: aria.daa05.isInaccessible(el),
      subtree: aria.daa05.isSubtreeInaccessible(el),
      name05: aria.daa05.computeAccessibleName(el),
      name06: aria.daa06.computeAccessibleName(el),
      desc05: aria.daa05.computeAccessibleDescription(el),
    })),
    roles: Object.fromEntries(Object.entries(aria.getRoles(doc.body)).map(([r, els]) => [r, els.map((e) => all.indexOf(e))])),
  };
}

function oracle(): unknown {
  const dom = new O.JSDOM(`<!doctype html><html><head></head><body>${HTML}</body></html>`);
  dom.window.getComputedStyle = replaced;
  const g = globalThis as any;
  const before = Object.getOwnPropertyDescriptor(g, "window");
  g.window = dom.window; // dom-accessibility-api's accname default reads the global window
  try {
    return evaluate(dom.window.document, { daa05: O.daa05, daa06: O.daa06, getRoles: O.roleHelpers.getRoles });
  } finally {
    if (before === undefined) delete g.window;
    else Object.defineProperty(g, "window", before);
  }
}

function ours(): unknown {
  const window = createWindow();
  window.document.body!.innerHTML = HTML;
  (window as any).getComputedStyle = replaced;
  try {
    return evaluate(window.document, { daa05: ctrlDom, daa06: ctrlDom.daa06, getRoles: ctrlDom.getRoles as never });
  } finally {
    window.close();
  }
}

describe("user-replaced getComputedStyle — https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle", () => {
  test("isInaccessible, isSubtreeInaccessible, names, descriptions and getRoles read styles through the replacement", () => {
    const expected = oracle() as any;
    // Non-vacuous: the stylesheet-hidden tab is accessible under the replacement.
    expect(expected.roles.tab.length).toBe(3);
    expect(ours()).toEqual(expected);
  });

  test("without a replacement the cascade applies (stylesheet rules hide)", () => {
    const window = createWindow();
    window.document.body!.innerHTML = HTML;
    const tabs = ctrlDom.getRoles(window.document.body as never).tab ?? [];
    expect(tabs.map((t: any) => t.textContent)).toEqual(["Details"]);
    const save = window.document.querySelector("button:not([aria-describedby])") as never;
    expect(ctrlDom.computeAccessibleName(save)).toBe("Save");
    window.close();
  });

  test("an explicit getComputedStyle option still wins over the window's", () => {
    const window = createWindow();
    window.document.body!.innerHTML = HTML;
    (window as any).getComputedStyle = () => ({ display: "none", visibility: "visible", getPropertyValue: (p: string) => (p === "display" ? "none" : "") });
    const tab = window.document.querySelector(".gone") as never;
    expect(ctrlDom.isInaccessible(tab, { getComputedStyle: replaced as never })).toBe(false);
    expect(ctrlDom.isInaccessible(tab)).toBe(true);
    window.close();
  });
});
