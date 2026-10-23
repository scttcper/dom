// Property metadata: the supported property list (generated from spec data), inheritance,
// initial values, which shorthands this implementation expands, and the IDL attribute names
// for CSSStyleDeclaration's named accessors.
// https://drafts.csswg.org/cssom/#css-property-to-idl-attribute
// https://drafts.csswg.org/css-cascade-5/#inheriting

import { PROPERTY_TABLE } from "./data/properties.ts";

export class PropInfo {
  name: string;
  inherited: boolean;
  /** Initial value as computed-value text (browser serialization). */
  initial: string;
  /** Longhands per spec data (also for shorthands we store as-is). */
  specLonghands: string[] | null;

  constructor(name: string, inherited: boolean, initial: string, specLonghands: string[] | null) {
    this.name = name;
    this.inherited = inherited;
    this.initial = initial;
    this.specLonghands = specLonghands;
  }
}

/**
 * Computed initial values in browser serialization for properties where the spec text
 * differs from what getComputedStyle reports (colors, zero lengths, keywords that compute).
 */
const COMPUTED_INITIAL: Record<string, string> = {
  color: "rgb(0, 0, 0)",
  "background-color": "rgba(0, 0, 0, 0)",
  "border-top-color": "currentcolor", "border-right-color": "currentcolor", "border-bottom-color": "currentcolor", "border-left-color": "currentcolor",
  "outline-color": "currentcolor",
  "border-block-start-color": "currentcolor", "border-block-end-color": "currentcolor", "border-inline-start-color": "currentcolor", "border-inline-end-color": "currentcolor", "text-decoration-color": "currentcolor", "column-rule-color": "currentcolor", "caret-color": "currentcolor",
  "text-emphasis-color": "currentcolor", "-webkit-text-fill-color": "currentcolor", "-webkit-text-stroke-color": "currentcolor",
  "margin-top": "0px", "margin-right": "0px", "margin-bottom": "0px", "margin-left": "0px",
  "padding-top": "0px", "padding-right": "0px", "padding-bottom": "0px", "padding-left": "0px",
  "border-top-width": "medium", "border-right-width": "medium", "border-bottom-width": "medium", "border-left-width": "medium",
  "outline-width": "medium", "column-rule-width": "medium",
  "border-top-left-radius": "0px", "border-top-right-radius": "0px", "border-bottom-right-radius": "0px", "border-bottom-left-radius": "0px",
  "font-size": "16px", "font-weight": "400", "font-family": '"Times New Roman"', "font-style": "normal", "font-variant": "normal",
  "line-height": "normal", "letter-spacing": "normal", "word-spacing": "0px", "text-indent": "0px", "outline-offset": "0px",
  "min-width": "auto", "min-height": "auto", "max-width": "none", "max-height": "none",
  "flex-basis": "auto", "flex-grow": "0", "flex-shrink": "1", "order": "0",
  "background-image": "none", "background-position-x": "0%", "background-position-y": "0%", "background-position": "0% 0%",
  "background-size": "auto", "background-repeat": "repeat", "background-origin": "padding-box", "background-clip": "border-box",
  "background-attachment": "scroll", "border-image": "none", "border-spacing": "0px 0px",
  "transition-duration": "0s", "transition-delay": "0s", "animation-duration": "0s", "animation-delay": "0s",
  "text-align": "start", "opacity": "1", "z-index": "auto", "row-gap": "normal", "column-gap": "normal",
  "user-select": "auto", "-webkit-user-select": "auto", "content": "normal", "quotes": "auto",
  "list-style-type": "disc", "vertical-align": "baseline", "white-space": "normal", "text-transform": "none",
};

// Built on first use (startup: ~0.2 ms of module evaluation otherwise).
let info: Map<string, PropInfo> = null as never;
let allNames: string[] = null as never;

function buildTable(): void {
  info = new Map();
  allNames = [];
  for (let i = 0; i < PROPERTY_TABLE.length; i += 4) {
    const name = PROPERTY_TABLE[i] as string;
    const inherited = PROPERTY_TABLE[i + 1] === 1;
    const initial = COMPUTED_INITIAL[name] ?? (PROPERTY_TABLE[i + 2] as string);
    const lh = PROPERTY_TABLE[i + 3] as string;
    info.set(name, new PropInfo(name, inherited, initial, lh === "" ? null : lh.split(" ")));
    allNames.push(name);
  }
  // Legacy -webkit- aliases (https://compat.spec.whatwg.org/#css-simple-aliases) carry no data
  // of their own; borrow inheritance/initial values from the unprefixed property.
  for (const name of allNames) {
    if (!name.startsWith("-webkit-")) continue;
    const p = info.get(name)!;
    const base = info.get(name.slice(8));
    if (base !== undefined && p.initial === "" && p.specLonghands === null) {
      p.inherited = base.inherited;
      p.initial = base.initial;
    }
  }
}

/** Metadata for a lowercase property name, or undefined if unsupported. */
export function propertyInfo(name: string): PropInfo | undefined {
  if (info === null) buildTable();
  return info.get(name);
}

export function isSupportedProperty(name: string): boolean {
  if (info === null) buildTable();
  return info.has(name);
}

export function isCustomPropertyName(name: string): boolean {
  return name.length > 2 && name.charCodeAt(0) === 0x2d && name.charCodeAt(1) === 0x2d;
}

export function isInherited(name: string): boolean {
  if (isCustomPropertyName(name)) return true;
  if (info === null) buildTable();
  const p = info.get(name);
  return p !== undefined && p.inherited;
}

/** All supported property names (sorted). */
export function allPropertyNames(): readonly string[] {
  if (allNames === null) buildTable();
  return allNames;
}

let computedNames: string[] | null = null;

/**
 * Properties enumerated by computed style declarations: longhands (no spec longhands of
 * their own), unprefixed, sorted — like browsers' `getComputedStyle()` item list.
 */
export function computedPropertyNames(): readonly string[] {
  if (computedNames !== null) return computedNames;
  computedNames = [];
  if (info === null) buildTable();
  for (const name of allNames) {
    const p = info.get(name)!;
    if (name.charCodeAt(0) === 0x2d || p.specLonghands !== null) continue;
    computedNames.push(name);
  }
  return computedNames;
}

/**
 * https://drafts.csswg.org/cssom/#css-property-to-idl-attribute — "margin-top" → "marginTop",
 * "-webkit-x" → "WebkitX" (with lowercase_first = false), "float" → also "cssFloat".
 */
export function cssPropertyToIDLAttribute(property: string, lowercaseFirst: boolean): string {
  if (lowercaseFirst && property.charCodeAt(0) === 0x2d) property = property.slice(1);
  let out = "";
  let upper = false;
  for (let i = 0; i < property.length; i++) {
    const c = property[i];
    if (c === "-") {
      upper = true;
    } else if (upper) {
      upper = false;
      out += c.toUpperCase();
    } else {
      out += c;
    }
  }
  return out;
}

/** Converts an IDL attribute name or property-ish key to a CSS property name ("" if none). */
export function idlAttributeToProperty(key: string): string {
  if (key === "cssFloat") return "float";
  if (key.indexOf("-") !== -1) return key.toLowerCase();
  let out = "";
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c >= 65 && c <= 90) out += "-" + key[i].toLowerCase();
    else out += key[i];
  }
  if (out.startsWith("webkit-")) out = "-" + out;
  return out;
}
