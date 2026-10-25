/**
 * Differential tests: @ctrl/dom/aria on @ctrl/dom vs the upstream stack on jsdom.
 *
 * Oracle (exact versions the drop-in targets resolve):
 *   - @testing-library/dom@10.4.2 role-helpers (getImplicitAriaRoles, isInaccessible,
 *     getRoles, computeAria*) on aria-query@5.3.0
 *   - dom-accessibility-api@0.5.16 (Testing Library) and 0.6.3 (jest-dom 7)
 *   - jest-dom@7's getImplicitAriaRoles variant
 *
 * Specs exercised:
 *   https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings (implicit roles)
 *   https://w3c.github.io/aria/#document-handling_author-errors_roles (explicit roles)
 *   https://w3c.github.io/accname/#computation-steps (names / descriptions)
 *   https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion (hidden)
 *   https://www.w3.org/TR/wai-aria-1.2/#state_prop_def (states)
 *   https://w3c.github.io/core-aam/#mapping_state-property (state mappings)
 *
 * Every element of every fixture (test/fixtures.ts) is evaluated by both stacks; any
 * difference fails with a per-element diff.
 */
import { describe, expect, test } from "vitest";
import { createWindow, type Element } from "@ctrl/dom";
import * as ctrlDom from "@ctrl/dom/aria";
import { comboFixtures, fixtures, type Fixture } from "./fixtures.ts";
import { jestDomImplicitRoles, loadOracle } from "./helpers.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const O = loadOracle();
const jdImplicit = jestDomImplicitRoles(O.ariaQuery);

function describeEl(el: any, i: number): string {
  const attrs = Array.from(el.attributes as ArrayLike<{ name: string; value: string }>)
    .map((a) => `${a.name}="${a.value}"`)
    .join(" ");
  return `#${i} <${el.localName}${attrs ? " " + attrs : ""}>`;
}

function rolesIndex(roles: Record<string, any[]>, all: any[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [role, els] of Object.entries(roles)) out[role] = els.map((e) => all.indexOf(e));
  return out;
}

function oracleResults(fx: Fixture) {
  const dom = new O.JSDOM(`<!doctype html><html><head></head><body>${fx.html}</body></html>`);
  const doc = dom.window.document;
  fx.setup?.(doc);
  const all = [doc.body, ...Array.from(doc.body.querySelectorAll("*"))] as any[];
  const RH = O.roleHelpers;
  const perElement = all.map((el, i) => ({
    el: describeEl(el, i),
    tlImplicit: RH.getImplicitAriaRoles(el),
    jestDomImplicit: jdImplicit(el),
    daa05Role: O.daa05.getRole(el),
    daa06Role: O.daa06.getRole(el),
    name05: O.daa05.computeAccessibleName(el),
    name06: O.daa06.computeAccessibleName(el),
    nameHidden: O.daa05.computeAccessibleName(el, { hidden: true }),
    desc05: O.daa05.computeAccessibleDescription(el),
    desc06: O.daa06.computeAccessibleDescription(el),
    tlInaccessible: RH.isInaccessible(el),
    daaInaccessible: O.daa05.isInaccessible(el),
    daaSubtreeInaccessible: O.daa05.isSubtreeInaccessible(el),
    disabled06: O.daa06.isDisabled(el),
    selected: RH.computeAriaSelected(el),
    busy: RH.computeAriaBusy(el),
    checked: RH.computeAriaChecked(el),
    pressed: RH.computeAriaPressed(el),
    current: RH.computeAriaCurrent(el),
    expanded: RH.computeAriaExpanded(el),
    level: RH.computeHeadingLevel(el),
    valueNow: RH.computeAriaValueNow(el),
    valueMax: RH.computeAriaValueMax(el),
    valueMin: RH.computeAriaValueMin(el),
    valueText: RH.computeAriaValueText(el),
  }));
  return {
    structure: all.map((el) => el.localName),
    perElement,
    roles: rolesIndex(RH.getRoles(doc.body), all),
    rolesHidden: rolesIndex(RH.getRoles(doc.body, { hidden: true }), all),
  };
}

function ctrlDomResults(fx: Fixture) {
  const doc = createWindow().document;
  doc.body!.innerHTML = fx.html;
  fx.setup?.(doc);
  const body = doc.body!;
  const all = [body, ...Array.from(body.querySelectorAll("*"))] as Element[];
  const perElement = all.map((el, i) => ({
    el: describeEl(el, i),
    tlImplicit: ctrlDom.getImplicitAriaRoles(el),
    jestDomImplicit: ctrlDom.getImplicitAriaRolesJestDom(el),
    daa05Role: ctrlDom.getRole(el),
    daa06Role: ctrlDom.daa06.getRole(el),
    name05: ctrlDom.computeAccessibleName(el),
    name06: ctrlDom.daa06.computeAccessibleName(el),
    nameHidden: ctrlDom.computeAccessibleName(el, { hidden: true }),
    desc05: ctrlDom.computeAccessibleDescription(el),
    desc06: ctrlDom.daa06.computeAccessibleDescription(el),
    tlInaccessible: ctrlDom.isInaccessible(el),
    daaInaccessible: ctrlDom.isInaccessible(el),
    daaSubtreeInaccessible: ctrlDom.isSubtreeInaccessible(el),
    disabled06: ctrlDom.isDisabled(el),
    selected: ctrlDom.computeAriaSelected(el),
    busy: ctrlDom.computeAriaBusy(el),
    checked: ctrlDom.computeAriaChecked(el),
    pressed: ctrlDom.computeAriaPressed(el),
    current: ctrlDom.computeAriaCurrent(el),
    expanded: ctrlDom.computeAriaExpanded(el),
    level: ctrlDom.computeHeadingLevel(el),
    valueNow: ctrlDom.computeAriaValueNow(el),
    valueMax: ctrlDom.computeAriaValueMax(el),
    valueMin: ctrlDom.computeAriaValueMin(el),
    valueText: ctrlDom.computeAriaValueText(el),
  }));
  return {
    structure: all.map((el) => el.localName),
    perElement,
    roles: rolesIndex(ctrlDom.getRoles(body), all),
    rolesHidden: rolesIndex(ctrlDom.getRoles(body, { hidden: true }), all),
  };
}

describe("differential: roles, names, descriptions, states, hidden — https://w3c.github.io/accname/ + https://www.w3.org/TR/html-aam-1.0/", () => {
  for (const fx of [...fixtures, ...comboFixtures]) {
    test(`fixture "${fx.name}" matches the upstream stack on jsdom`, () => {
      const expected = oracleResults(fx);
      const actual = ctrlDomResults(fx);
      // Both parsers must build the same tree for the comparison to be meaningful.
      expect(actual.structure).toEqual(expected.structure);
      for (let i = 0; i < expected.perElement.length; i++) {
        expect(actual.perElement[i]).toEqual(expected.perElement[i]);
      }
      expect(actual.roles).toEqual(expected.roles);
      expect(actual.rolesHidden).toEqual(expected.rolesHidden);
    });
  }
});

describe("differential: aria-query data surface — https://www.w3.org/TR/wai-aria-1.2/#role_definitions", () => {
  test("roles map equals aria-query@5.3.0 (keys, props, superClass, ...)", () => {
    expect(ctrlDom.roles.keys()).toEqual(O.ariaQuery.roles.keys());
    for (const key of O.ariaQuery.roles.keys()) {
      expect(ctrlDom.roles.get(key)).toEqual(O.ariaQuery.roles.get(key));
    }
    expect(ctrlDom.roles.get("nope")).toBeUndefined();
    expect(ctrlDom.roles.has("button")).toBe(true);
  });

  test("elementRoles / roleElements equal aria-query@5.3.0", () => {
    expect(ctrlDom.elementRoles.entries()).toEqual(
      O.ariaQuery.elementRoles.entries().map(([k, v]: any) => [k, [...v]]),
    );
    for (const [concept] of O.ariaQuery.elementRoles.entries()) {
      expect(ctrlDom.elementRoles.get(concept)).toEqual([...O.ariaQuery.elementRoles.get(concept)]);
    }
    for (const role of O.ariaQuery.roleElements.keys()) {
      expect(ctrlDom.roleElements.get(role)).toEqual([...O.ariaQuery.roleElements.get(role)]);
    }
  });

  test("forEach and iteration follow aria-query's TLookup interface", () => {
    const seen: string[] = [];
    ctrlDom.roles.forEach((_value, key) => seen.push(key));
    expect(seen).toEqual(O.ariaQuery.roles.keys());
    expect([...ctrlDom.roles].length).toBe(O.ariaQuery.roles.keys().length);
  });
});
