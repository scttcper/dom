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
  "border-top-color": "currentcolor",
  "border-right-color": "currentcolor",
  "border-bottom-color": "currentcolor",
  "border-left-color": "currentcolor",
  "outline-color": "currentcolor",
  "border-block-start-color": "currentcolor",
  "border-block-end-color": "currentcolor",
  "border-inline-start-color": "currentcolor",
  "border-inline-end-color": "currentcolor",
  "text-decoration-color": "currentcolor",
  "column-rule-color": "currentcolor",
  "caret-color": "currentcolor",
  "text-emphasis-color": "currentcolor",
  "-webkit-text-fill-color": "currentcolor",
  "-webkit-text-stroke-color": "currentcolor",
  "margin-top": "0px",
  "margin-right": "0px",
  "margin-bottom": "0px",
  "margin-left": "0px",
  "padding-top": "0px",
  "padding-right": "0px",
  "padding-bottom": "0px",
  "padding-left": "0px",
  "border-top-width": "medium",
  "border-right-width": "medium",
  "border-bottom-width": "medium",
  "border-left-width": "medium",
  "outline-width": "medium",
  "column-rule-width": "medium",
  "border-top-left-radius": "0px",
  "border-top-right-radius": "0px",
  "border-bottom-right-radius": "0px",
  "border-bottom-left-radius": "0px",
  "font-size": "16px",
  "font-weight": "400",
  "font-family": '"Times New Roman"',
  "font-style": "normal",
  "font-variant": "normal",
  "line-height": "normal",
  "letter-spacing": "normal",
  "word-spacing": "0px",
  "text-indent": "0px",
  "outline-offset": "0px",
  "min-width": "auto",
  "min-height": "auto",
  "max-width": "none",
  "max-height": "none",
  "flex-basis": "auto",
  "flex-grow": "0",
  "flex-shrink": "1",
  order: "0",
  "background-image": "none",
  "background-position-x": "0%",
  "background-position-y": "0%",
  "background-position": "0% 0%",
  "background-size": "auto",
  "background-repeat": "repeat",
  "background-origin": "padding-box",
  "background-clip": "border-box",
  "background-attachment": "scroll",
  "border-image": "none",
  "border-spacing": "0px 0px",
  "transition-duration": "0s",
  "transition-delay": "0s",
  "animation-duration": "0s",
  "animation-delay": "0s",
  "text-align": "start",
  opacity: "1",
  "z-index": "auto",
  "row-gap": "normal",
  "column-gap": "normal",
  "user-select": "auto",
  "-webkit-user-select": "auto",
  content: "normal",
  quotes: "auto",
  "list-style-type": "disc",
  "vertical-align": "baseline",
  "white-space": "normal",
  "text-transform": "none",
};

/**
 * Legacy name aliases (https://compat.spec.whatwg.org/#css-simple-aliases, plus
 * `-webkit-appearance` and `-webkit-user-select` from css-ui-4 and `-webkit-text-size-adjust`
 * from css-size-adjust): at parse time the alias is the standard property, so a declaration set
 * through one is stored, serialized (cssText) and read back under the standard name
 * (https://drafts.csswg.org/css-cascade-5/#legacy-name-alias). jsdom ≤30 kept them separate;
 * jsdom 31 and browsers alias them. `-webkit-line-clamp` is not one: css-overflow-4 defines it as
 * a legacy shorthand of its own.
 */
const LEGACY_ALIASES = new Map<string, string>([
  ["-webkit-align-content", "align-content"],
  ["-webkit-align-items", "align-items"],
  ["-webkit-align-self", "align-self"],
  ["-webkit-animation", "animation"],
  ["-webkit-animation-delay", "animation-delay"],
  ["-webkit-animation-direction", "animation-direction"],
  ["-webkit-animation-duration", "animation-duration"],
  ["-webkit-animation-fill-mode", "animation-fill-mode"],
  ["-webkit-animation-iteration-count", "animation-iteration-count"],
  ["-webkit-animation-name", "animation-name"],
  ["-webkit-animation-play-state", "animation-play-state"],
  ["-webkit-animation-timing-function", "animation-timing-function"],
  ["-webkit-appearance", "appearance"],
  ["-webkit-backface-visibility", "backface-visibility"],
  ["-webkit-background-clip", "background-clip"],
  ["-webkit-background-origin", "background-origin"],
  ["-webkit-background-size", "background-size"],
  ["-webkit-border-bottom-left-radius", "border-bottom-left-radius"],
  ["-webkit-border-bottom-right-radius", "border-bottom-right-radius"],
  ["-webkit-border-radius", "border-radius"],
  ["-webkit-border-top-left-radius", "border-top-left-radius"],
  ["-webkit-border-top-right-radius", "border-top-right-radius"],
  ["-webkit-box-shadow", "box-shadow"],
  ["-webkit-box-sizing", "box-sizing"],
  ["-webkit-filter", "filter"],
  ["-webkit-flex", "flex"],
  ["-webkit-flex-basis", "flex-basis"],
  ["-webkit-flex-direction", "flex-direction"],
  ["-webkit-flex-flow", "flex-flow"],
  ["-webkit-flex-grow", "flex-grow"],
  ["-webkit-flex-shrink", "flex-shrink"],
  ["-webkit-flex-wrap", "flex-wrap"],
  ["-webkit-justify-content", "justify-content"],
  ["-webkit-mask", "mask"],
  ["-webkit-mask-box-image", "mask-border"],
  ["-webkit-mask-box-image-outset", "mask-border-outset"],
  ["-webkit-mask-box-image-repeat", "mask-border-repeat"],
  ["-webkit-mask-box-image-slice", "mask-border-slice"],
  ["-webkit-mask-box-image-source", "mask-border-source"],
  ["-webkit-mask-box-image-width", "mask-border-width"],
  ["-webkit-mask-clip", "mask-clip"],
  ["-webkit-mask-composite", "mask-composite"],
  ["-webkit-mask-image", "mask-image"],
  ["-webkit-mask-origin", "mask-origin"],
  ["-webkit-mask-position", "mask-position"],
  ["-webkit-mask-repeat", "mask-repeat"],
  ["-webkit-mask-size", "mask-size"],
  ["-webkit-order", "order"],
  ["-webkit-perspective", "perspective"],
  ["-webkit-perspective-origin", "perspective-origin"],
  ["-webkit-text-size-adjust", "text-size-adjust"],
  ["-webkit-transform", "transform"],
  ["-webkit-transform-origin", "transform-origin"],
  ["-webkit-transform-style", "transform-style"],
  ["-webkit-transition", "transition"],
  ["-webkit-transition-delay", "transition-delay"],
  ["-webkit-transition-duration", "transition-duration"],
  ["-webkit-transition-property", "transition-property"],
  ["-webkit-transition-timing-function", "transition-timing-function"],
  ["-webkit-user-select", "user-select"],
]);

/** The property a lowercase name stands for: the aliased property for a legacy name alias, else the name. */
export function canonicalPropertyName(lower: string): string {
  return lower.charCodeAt(0) === 0x2d ? (LEGACY_ALIASES.get(lower) ?? lower) : lower;
}

// Metadata is built per property on first use, and the name list without it: every test file
// that imports react-dom needs the names (react-dom probes `createElement("div").style` for vendor
// prefixes as it loads, which installs CSSStyleDeclaration's accessors), few need more than a
// dozen properties' metadata, and building all 821 was 0.27 ms of each file.
const info = new Map<string, PropInfo>();
let allNames: string[] | null = null;

/** Offset of `name`'s row in PROPERTY_TABLE (sorted by name; properties.test.ts checks), or -1. */
function tableOffset(name: string): number {
  let lo = 0;
  let hi = PROPERTY_TABLE.length / 4 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const candidate = PROPERTY_TABLE[mid * 4] as string;
    if (candidate === name) return mid * 4;
    if (candidate < name) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Metadata for a lowercase property name, or undefined if unsupported. */
export function propertyInfo(name: string): PropInfo | undefined {
  let p = info.get(name);
  if (p !== undefined) return p;
  const i = tableOffset(name);
  if (i === -1) return undefined;
  const lh = PROPERTY_TABLE[i + 3] as string;
  p = new PropInfo(
    name,
    PROPERTY_TABLE[i + 1] === 1,
    COMPUTED_INITIAL[name] ?? (PROPERTY_TABLE[i + 2] as string),
    lh === "" ? null : lh.split(" "),
  );
  // Legacy -webkit- aliases (https://compat.spec.whatwg.org/#css-simple-aliases) carry no data
  // of their own; borrow inheritance/initial values from the unprefixed property.
  if (p.initial === "" && p.specLonghands === null && name.startsWith("-webkit-")) {
    const base = propertyInfo(name.slice(8));
    if (base !== undefined) {
      p.inherited = base.inherited;
      p.initial = base.initial;
    }
  }
  info.set(name, p);
  return p;
}

export function isSupportedProperty(name: string): boolean {
  return propertyInfo(name) !== undefined;
}

export function isCustomPropertyName(name: string): boolean {
  return name.length > 2 && name.charCodeAt(0) === 0x2d && name.charCodeAt(1) === 0x2d;
}

export function isInherited(name: string): boolean {
  if (isCustomPropertyName(name)) return true;
  const p = propertyInfo(name);
  return p !== undefined && p.inherited;
}

/** All supported property names (sorted). */
export function allPropertyNames(): readonly string[] {
  if (allNames === null) {
    allNames = new Array(PROPERTY_TABLE.length / 4);
    for (let i = 0; i < allNames.length; i++) allNames[i] = PROPERTY_TABLE[i * 4] as string;
  }
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
  for (let i = 0; i < PROPERTY_TABLE.length; i += 4) {
    const name = PROPERTY_TABLE[i] as string;
    if (name.charCodeAt(0) === 0x2d || PROPERTY_TABLE[i + 3] !== "") continue;
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
