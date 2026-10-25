/**
 * Differential tests: a user-replaced `window.getComputedStyle` (Sentry's Jest setup:
 * `window.getComputedStyle = el => el.style`, skipping jsdom's cascade).
 *
 * Stock @testing-library/dom@10.4.2 reads every style through it: role-helpers.js
 * `isInaccessible` / `isSubtreeInaccessible` call `element.ownerDocument.defaultView
 * .getComputedStyle(element)` (`visibility`, then `display` per ancestor) and
 * dom-accessibility-api@0.5.16's name computation defaults to
 * `window.getComputedStyle.bind(window)`. So with the replacement in place, stylesheet rules
 * hide nothing from ByRole, getRoles, isInaccessible, suggestions or accessible names, while
 * inline styles, `hidden` and `aria-hidden` still do. @ctrl/dom/testing-library must agree.
 *
 * Oracle: stock Testing Library on jsdom with the same replacement on the jsdom window (role
 * helpers) and on the global window (dom-accessibility-api's default). Spec of record: the
 * stock library (https://github.com/testing-library/dom-testing-library/blob/main/src/role-helpers.js),
 * CSSOM getComputedStyle: https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import * as stock from "@testing-library/dom";
import * as ours from "../../src/index.ts";

type Lib = typeof stock;

const STYLES = `<style>.gone { display: none } .ghost { visibility: hidden }</style>`;

const replaced = (el: any) => el.style;

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object" && typeof (value as any).nodeType === "number")
    return (value as any).outerHTML;
  if (value !== null && typeof value === "object" && "queryMethod" in (value as any)) return (value as any).toString();
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) out[k] = normalize(v);
    return out;
  }
  return value;
}

/** Run `run` with getComputedStyle replaced on the element's window and on the global window. */
function outcome(lib: Lib, container: any, run: (lib: Lib, c: any) => unknown): unknown {
  const view = container.ownerDocument.defaultView;
  const g = globalThis as any;
  const hadOwn = Object.hasOwn(view, "getComputedStyle");
  const ownBefore = view.getComputedStyle;
  const globalBefore = g.getComputedStyle;
  view.getComputedStyle = replaced;
  g.getComputedStyle = replaced;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    return { result: normalize(run(lib, container)), logs: log.mock.calls.map((c) => c.join(" ")) };
  } catch (e: any) {
    return { error: { name: e?.name, message: e?.message } };
  } finally {
    log.mockRestore();
    g.getComputedStyle = globalBefore;
    if (view !== g) {
      if (hadOwn) view.getComputedStyle = ownBefore;
      else delete view.getComputedStyle;
    }
  }
}

function jsdomContainer(html: string): any {
  const dom = new JSDOM(`<!doctype html><html><head>${STYLES}</head><body><div id="root">${html}</div></body></html>`);
  return dom.window.document.getElementById("root");
}

function ctrlDomContainer(html: string): any {
  document.head.innerHTML = STYLES;
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById("root");
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const TABS = `
  <ul role="tablist">
    <li role="tab">Details</li>
    <li role="tab" class="gone">Attachments</li>
    <li role="tab" class="ghost">Activity</li>
    <li role="tab" style="display: none">Inline hidden</li>
    <li role="tab" hidden>Attr hidden</li>
    <li role="tab" aria-hidden="true">Aria hidden</li>
  </ul>
  <div class="gone"><button>Inside gone</button></div>
  <div style="visibility: hidden"><button>Inside inline invisible</button></div>
  <button>Save <span class="ghost">draft</span><span class="gone"> now</span></button>
`;

interface Scenario {
  name: string;
  html: string;
  run: (lib: Lib, container: any) => unknown;
}

function differential(scenarios: Scenario[]): void {
  for (const s of scenarios) {
    test(s.name, () => {
      const expected = outcome(stock, jsdomContainer(s.html), s.run);
      const actual = outcome(ours as unknown as Lib, ctrlDomContainer(s.html), s.run);
      expect(actual).toEqual(expected);
    });
  }
}

describe("role-helpers isInaccessible reads window.getComputedStyle — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion", () => {
  differential([
    {
      name: "ByRole: stylesheet display/visibility hide nothing; inline style, hidden, aria-hidden still do",
      html: TABS,
      run: (l, c) => l.queryAllByRole(c, "tab"),
    },
    {
      name: "ByRole: descendants of a stylesheet display:none ancestor are accessible",
      html: TABS,
      run: (l, c) => l.queryAllByRole(c, "button"),
    },
    {
      name: "ByRole hidden: true is unaffected",
      html: TABS,
      run: (l, c) => l.queryAllByRole(c, "tab", { hidden: true }),
    },
    {
      name: "getRoles",
      html: TABS,
      run: (l, c) => Object.fromEntries(Object.entries(l.getRoles(c)).map(([r, els]) => [r, els.length])),
    },
    {
      name: "isInaccessible (default and custom subtree check)",
      html: TABS,
      run: (l, c) =>
        [...c.querySelectorAll("li, button")].map((el: any) => [
          l.isInaccessible(el),
          (l.isInaccessible as (e: any, o: object) => boolean)(el, { isSubtreeInaccessible: () => false }),
        ]),
    },
    { name: "logRoles output", html: TABS, run: (l, c) => l.logRoles(c) },
    { name: "missing role error lists roles and names", html: TABS, run: (l, c) => l.getByRole(c, "heading") },
  ]);
});

describe("accessible names read window.getComputedStyle — https://w3c.github.io/accname/#step2A", () => {
  differential([
    {
      name: "name includes text hidden only by a stylesheet",
      html: TABS,
      run: (l, c) => l.queryAllByRole(c, "button", { name: "Save draft now" }),
    },
    {
      name: "name filter on a stylesheet-hidden tab",
      html: TABS,
      run: (l, c) => l.queryAllByRole(c, "tab", { name: "Attachments" }),
    },
    {
      name: "getSuggestedQuery for an element hidden by a stylesheet",
      html: TABS,
      run: (l, c) => l.getSuggestedQuery(c.querySelector(".gone[role=tab]"), "get"),
    },
  ]);
});

describe("Vitest spies on getComputedStyle (ctrl-dom only)", () => {
  test("a spy that calls through leaves results unchanged; mockImplementation is honored", () => {
    const c = ctrlDomContainer(TABS);
    const names = () => ours.queryAllByRole(c, "tab").map((t: any) => t.textContent);
    const real = names();
    expect(real).toEqual(["Details"]);
    const spy = vi.spyOn(window, "getComputedStyle");
    try {
      expect(names()).toEqual(real);
      expect(spy).toHaveBeenCalled();
      spy.mockImplementation((el: any) => el.style);
      expect(names()).toEqual(["Details", "Attachments", "Activity"]);
    } finally {
      spy.mockRestore();
    }
    expect(names()).toEqual(real);
  });
});
