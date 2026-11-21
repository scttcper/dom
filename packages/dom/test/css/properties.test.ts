/**
 * Property metadata (src/css/properties.ts): the supported property list, inheritance, initial
 * values and legacy aliases, built per property on first use from the generated table
 * (src/css/data/properties.ts).
 *
 * Specs:
 *   CSS Cascading 5 §7.2 inheritance — https://drafts.csswg.org/css-cascade-5/#inheriting
 *   CSS Cascading 5 §7.1 initial values — https://drafts.csswg.org/css-cascade-5/#initial-values
 *   Compatibility §3.2 CSS simple aliases — https://compat.spec.whatwg.org/#css-simple-aliases
 *   CSSOM §6.6.1 CSS property to IDL attribute — https://drafts.csswg.org/cssom/#css-property-to-idl-attribute
 */
import { describe, expect, test } from "vitest";
import { PROPERTY_TABLE } from "../../src/css/data/properties.ts";
import {
  allPropertyNames,
  computedPropertyNames,
  isInherited,
  isSupportedProperty,
  propertyInfo,
} from "../../src/css/properties.ts";

describe("the generated property table — src/css/data/properties.ts", () => {
  test("rows are sorted by name in code unit order, which propertyInfo's binary search relies on", () => {
    for (let i = 4; i < PROPERTY_TABLE.length; i += 4) {
      expect((PROPERTY_TABLE[i - 4] as string) < (PROPERTY_TABLE[i] as string), String(PROPERTY_TABLE[i])).toBe(true);
    }
  });

  test("every row is found, with its own name, and names outside the table are not", () => {
    const names = allPropertyNames();
    expect(names).toHaveLength(PROPERTY_TABLE.length / 4);
    for (const name of names) expect(propertyInfo(name)?.name, name).toBe(name);
    // Asked again: the same record.
    expect(propertyInfo("display")).toBe(propertyInfo("display"));
    for (const name of ["", "displa", "displayy", "-webkit-", "zzz", "Display", "--custom", "0"]) {
      expect(isSupportedProperty(name), name).toBe(false);
      expect(propertyInfo(name), name).toBeUndefined();
    }
  });
});

describe("§7.2 inheritance and §7.1 initial values — https://drafts.csswg.org/css-cascade-5/#inheriting", () => {
  test("inherited and initial come from the table, with getComputedStyle's serialization of the initial value", () => {
    expect(propertyInfo("color")).toMatchObject({ inherited: true, initial: "rgb(0, 0, 0)", specLonghands: null });
    expect(propertyInfo("display")).toMatchObject({ inherited: false, initial: "inline" });
    expect(propertyInfo("visibility")).toMatchObject({ inherited: true, initial: "visible" });
    expect(isInherited("font-size")).toBe(true);
    expect(isInherited("margin-top")).toBe(false);
    // Custom properties inherit; unknown properties do not.
    expect(isInherited("--gap")).toBe(true);
    expect(isInherited("not-a-property")).toBe(false);
  });

  test("a shorthand lists its longhands", () => {
    expect(propertyInfo("margin")!.specLonghands).toEqual([
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
    ]);
  });

  test("a -webkit- alias without data of its own borrows from the unprefixed property, whichever is asked first — https://compat.spec.whatwg.org/#css-simple-aliases", () => {
    // Alias first: its record is built before the unprefixed one's.
    const alias = propertyInfo("-webkit-user-select")!;
    expect(alias).toMatchObject({ name: "-webkit-user-select", initial: "auto" });
    const prefixed = propertyInfo("-webkit-text-size-adjust")!;
    const standard = propertyInfo("text-size-adjust")!;
    expect([prefixed.inherited, prefixed.initial]).toEqual([standard.inherited, standard.initial]);
    for (const name of allPropertyNames()) {
      if (!name.startsWith("-webkit-")) continue;
      const p = propertyInfo(name)!;
      const base = propertyInfo(name.slice(8));
      if (base === undefined || p.specLonghands !== null) continue;
      // Either it had an initial value of its own, or it has the base's.
      if (p.initial !== base.initial) expect(p.initial, name).not.toBe("");
    }
  });
});

describe("computed style enumeration — https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle", () => {
  test("computedPropertyNames() is the unprefixed longhands, in table order", () => {
    const expected = allPropertyNames().filter((name) => name[0] !== "-" && propertyInfo(name)!.specLonghands === null);
    expect(computedPropertyNames()).toEqual(expected);
    expect(computedPropertyNames()).toContain("margin-top");
    expect(computedPropertyNames()).not.toContain("margin");
  });
});
