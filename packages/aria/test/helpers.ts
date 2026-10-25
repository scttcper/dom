// Shared test helpers for @ctrl/dom/aria: an @ctrl/dom document per test file, and the upstream
// oracle (jsdom + dom-accessibility-api + aria-query + Testing Library role-helpers, the
// exact versions @testing-library/dom@10.4.2 and @testing-library/jest-dom@7 resolve).

import { createRequire } from "node:module";
import { createWindow, type Document, type Element } from "@ctrl/dom";
import * as ctrlDom from "@ctrl/dom/aria";

/** dom-accessibility-api test-utils `render`/`renderIntoDocument`/`cleanup`, on @ctrl/dom. */
export function makeDocument(): {
  document: Document;
  render(html: string, container?: Element): Element;
  renderIntoDocument(html: string): Element;
  cleanup(): void;
} {
  const window = createWindow();
  const document = window.document;
  return {
    document,
    render(html, container = document.createElement("div")) {
      container.innerHTML = html;
      return container;
    },
    renderIntoDocument(html) {
      document.body!.innerHTML = html;
      return document.body!;
    },
    cleanup() {
      document.body!.innerHTML = "";
    },
  };
}

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Oracle {
  JSDOM: any;
  /** dom-accessibility-api@0.5.16 (Testing Library 10.4.2) */
  daa05: any;
  /** dom-accessibility-api@0.6.3 (jest-dom 7) */
  daa06: any;
  /** aria-query@5.3.0 */
  ariaQuery: any;
  /** @testing-library/dom@10.4.2 dist/role-helpers.js */
  roleHelpers: any;
}

let oracle: Oracle | null = null;
export function loadOracle(): Oracle {
  if (oracle !== null) return oracle;
  const tlDir = require.resolve("@testing-library/dom/package.json").replace(/package\.json$/, "");
  oracle = {
    JSDOM: require("jsdom").JSDOM,
    daa05: require("dom-accessibility-api"),
    daa06: require("dom-accessibility-api-0.6"),
    ariaQuery: require("aria-query"),
    roleHelpers: require(tlDir + "dist/role-helpers.js"),
  };
  return oracle;
}

/**
 * jest-dom@7's `getImplicitAriaRoles` (copied from
 * @testing-library/jest-dom dist/matchers-*.js `buildElementRoleList`, MIT), on aria-query.
 */
export function jestDomImplicitRoles(ariaQuery: any): (node: any) => string[] {
  function makeElementSelector({ name, attributes }: any) {
    return `${name}${attributes
      .map(({ name: attributeName, value, constraints = [] }: any) => {
        const shouldNotExist = constraints.indexOf("undefined") !== -1;
        if (shouldNotExist) return `:not([${attributeName}])`;
        else if (value) return `[${attributeName}="${value}"]`;
        else return `[${attributeName}]`;
      })
      .join("")}`;
  }
  function match(element: any) {
    let { attributes = [] } = element;
    const typeTextIndex = attributes.findIndex(
      (attribute: any) => attribute.value && attribute.name === "type" && attribute.value === "text",
    );
    if (typeTextIndex >= 0) {
      attributes = [...attributes.slice(0, typeTextIndex), ...attributes.slice(typeTextIndex + 1)];
    }
    const selector = makeElementSelector({ ...element, attributes });
    return (node: any) => {
      if (typeTextIndex >= 0 && node.type !== "text") return false;
      return node.matches(selector);
    };
  }
  let result: any[] = [];
  for (const [element, roles] of ariaQuery.elementRoles.entries()) {
    result = [...result, { match: match(element), roles: Array.from(roles), specificity: (element.attributes ?? []).length }];
  }
  result.sort((a, b) => b.specificity - a.specificity);
  return (node) => {
    for (const { match, roles } of result) if (match(node)) return [...roles];
    return [];
  };
}

/**
 * The same accessibility API surface on both engines: @ctrl/dom/aria on @ctrl/dom, and the upstream
 * oracle (dom-accessibility-api@0.5.16 / 0.6.3 + Testing Library 10.4.2 role-helpers on
 * jsdom). Spec tests probe one element through it and assert the spec value on both engines,
 * so every assertion is also a differential one.
 */
export interface AriaApi {
  name(el: any, options?: { hidden?: boolean }): string;
  description(el: any): string;
  /** dom-accessibility-api `getRole` (used inside the name computation). */
  role(el: any): string | null;
  /** Testing Library `getImplicitAriaRoles` (what `*ByRole` matches). */
  implicitRoles(el: any): string[];
  inaccessible(el: any): boolean;
  subtreeInaccessible(el: any): boolean;
  /** Testing Library `getRoles(container)` as `{ role: [data-id, ...] }` (elements without data-id omitted). */
  roles(container: any, options?: { hidden?: boolean }): Record<string, string[]>;
  checked(el: any): boolean | undefined;
  pressed(el: any): boolean | undefined;
  expanded(el: any): boolean | undefined;
  selected(el: any): boolean | undefined;
  current(el: any): boolean | string;
  level(el: any): number | undefined;
  busy(el: any): boolean;
  valueNow(el: any): number | undefined;
  /** dom-accessibility-api@0.6 `isDisabled` (jest-dom's toBeDisabled helpers). */
  disabled(el: any): boolean;
}

export interface Engine {
  engine: string;
  api: AriaApi;
  /** Parses `html` into a fresh body and returns the document. */
  load(html: string): any;
}

function roleIds(roles: Record<string, any[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [role, els] of Object.entries(roles)) {
    const ids = els.map((e) => e.getAttribute("data-id")).filter((id) => id !== null);
    if (ids.length > 0) out[role] = ids;
  }
  return out;
}

export function engines(): Engine[] {
  const O = loadOracle();
  const RH = O.roleHelpers;
  const ctrlDomApi: AriaApi = {
    name: (el, o) => ctrlDom.computeAccessibleName(el, o),
    description: (el) => ctrlDom.computeAccessibleDescription(el),
    role: (el) => ctrlDom.getRole(el),
    implicitRoles: (el) => ctrlDom.getImplicitAriaRoles(el),
    inaccessible: (el) => ctrlDom.isInaccessible(el),
    subtreeInaccessible: (el) => ctrlDom.isSubtreeInaccessible(el),
    roles: (c, o) => roleIds(ctrlDom.getRoles(c, o) as any),
    checked: (el) => ctrlDom.computeAriaChecked(el),
    pressed: (el) => ctrlDom.computeAriaPressed(el),
    expanded: (el) => ctrlDom.computeAriaExpanded(el),
    selected: (el) => ctrlDom.computeAriaSelected(el),
    current: (el) => ctrlDom.computeAriaCurrent(el),
    level: (el) => ctrlDom.computeHeadingLevel(el),
    busy: (el) => ctrlDom.computeAriaBusy(el),
    valueNow: (el) => ctrlDom.computeAriaValueNow(el),
    disabled: (el) => ctrlDom.daa06.isDisabled(el),
  };
  const oracleApi: AriaApi = {
    name: (el, o) => O.daa05.computeAccessibleName(el, o),
    description: (el) => O.daa05.computeAccessibleDescription(el),
    role: (el) => O.daa05.getRole(el),
    implicitRoles: (el) => RH.getImplicitAriaRoles(el),
    inaccessible: (el) => RH.isInaccessible(el),
    subtreeInaccessible: (el) => O.daa05.isSubtreeInaccessible(el),
    roles: (c, o) => roleIds(RH.getRoles(c, o)),
    checked: (el) => RH.computeAriaChecked(el),
    pressed: (el) => RH.computeAriaPressed(el),
    expanded: (el) => RH.computeAriaExpanded(el),
    selected: (el) => RH.computeAriaSelected(el),
    current: (el) => RH.computeAriaCurrent(el),
    level: (el) => RH.computeHeadingLevel(el),
    busy: (el) => RH.computeAriaBusy(el),
    valueNow: (el) => RH.computeAriaValueNow(el),
    disabled: (el) => O.daa06.isDisabled(el),
  };
  const ctrlDomDoc = createWindow().document;
  return [
    {
      engine: "@ctrl/dom/aria on @ctrl/dom",
      api: ctrlDomApi,
      load(html) {
        ctrlDomDoc.body!.innerHTML = html;
        return ctrlDomDoc;
      },
    },
    {
      engine: "upstream on jsdom",
      api: oracleApi,
      load(html) {
        return new O.JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`).window.document;
      },
    },
  ];
}

/**
 * Runs `probe(api, doc)` on both engines and returns `[ctrl-dom, oracle]` results; the caller
 * asserts the spec value against both (`expectBoth`).
 */
export function onBoth<R>(html: string, probe: (api: AriaApi, doc: any) => R): [R, R] {
  const [a, b] = engines();
  return [probe(a.api, a.load(html)), probe(b.api, b.load(html))];
}

/** `{ ctrl-dom, upstream }` from `onBoth`, for one `toEqual` that shows both sides on failure. */
export function both<R>(html: string, probe: (api: AriaApi, doc: any) => R): { "ctrl-dom": R; upstream: R } {
  const [ctrlDomResult, upstream] = onBoth(html, probe);
  return { "ctrl-dom": ctrlDomResult, upstream };
}

/** `[data-test]` of a loaded document. */
export function testNode(doc: any): any {
  const el = doc.querySelector("[data-test]");
  if (el === null) throw new Error("no [data-test] element");
  return el;
}
