// Shared test helpers for @rtd/aria: an @rtd/dom document per test file, and the upstream
// oracle (jsdom + dom-accessibility-api + aria-query + Testing Library role-helpers, the
// exact versions @testing-library/dom@10.4.2 and @testing-library/jest-dom@7 resolve).

import { createRequire } from "node:module";
import { createWindow, type Document, type Element } from "@rtd/dom";

/** dom-accessibility-api test-utils `render`/`renderIntoDocument`/`cleanup`, on @rtd/dom. */
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
