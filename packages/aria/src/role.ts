// Role computation.
//
// Two different implicit-role tables are needed for drop-in compatibility:
//
// 1. Testing Library's (`getImplicitAriaRoles` in @testing-library/dom@10.4.2
//    role-helpers.js): aria-query@5.3.0 `elementRoles` turned into CSS selectors, sorted by
//    number of attribute constraints, first match wins. Element-level constraints ("scoped to
//    the body element", "ancestor table element has grid role", ...) are ignored, attribute
//    constraint "set" means present-and-non-empty, "undefined" means absent, and the
//    `type="text"` entries test `node.type === "text"`. This is what `*ByRole` and
//    `logRoles` use. jest-dom@7 (`toHaveRole`) builds the same list with a slightly
//    different selector builder ("set" means merely present, `[alt=""]` degenerates to
//    `[alt]`); `implicitRoleJestDom` reproduces that.
//
// 2. dom-accessibility-api's `getRole` (0.5.16 for Testing Library, 0.6.3 for jest-dom),
//    used inside the accessible name computation (name-from-content, controls, prohibited
//    naming).
//
// Both are implemented as integer switches over `NodeImpl.tag` — no selector matching.
//
// Specs:
//   https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings
//   https://w3c.github.io/html-aria/#docconformance
//   https://w3c.github.io/aria/#document-handling_author-errors_roles
//   https://w3c.github.io/aria/#conflict_resolution_presentation_none

import {
  $version,
  ELEMENT_NODE,
  F_ROLE_ATTR,
  HTML_NS,
  T,
  ariaAttr,
  attr,
  nodeCache,
  tagId,
  type NodeImpl,
} from "@ctrl/dom/internal";
import { inputType, selectSize } from "./forms.ts";

/** Tag id by local name for any namespace (type selectors / `localName` checks are namespace-agnostic). */
export function anyTag(impl: NodeImpl): number {
  return impl.tag !== 0 ? impl.tag : tagId(impl.name);
}

/** Present and not the empty string (aria-query constraint "set"). */
function isSet(impl: NodeImpl, name: string): boolean {
  const v = attr(impl, name);
  return v !== null && v !== "";
}

/** `[name="value"]` for HTML attributes whose values match ASCII case-insensitively in selectors (`type`, `scope`). */
function eqCI(v: string | null, lower: string): boolean {
  return v !== null && v.length === lower.length && (v === lower || v.toLowerCase() === lower);
}

// -----------------------------------------------------------------------------------------
// Testing Library / aria-query@5.3.0 implicit roles.

// Tags whose Testing Library implicit role never depends on attributes ("" for no role), the
// only list of them: read in O(1) without allocating a per-node NodeCache. Conditional tags
// (`input`, `select`, `th`, `form`, `img`, `a`, `area`, `section`) stay `undefined` and are the
// cases of implicitRoleImpl's switch.
const STATIC_IMPLICIT_ROLE: (string | undefined)[] = new Array<string | undefined>(Object.keys(T).length + 1).fill("");
for (const name of ["input", "select", "th", "form", "img", "a", "area", "section"]) {
  STATIC_IMPLICIT_ROLE[tagId(name)] = undefined;
}
// oxfmt-ignore
setRoles(STATIC_IMPLICIT_ROLE, {
  complementary: "aside", article: "article", banner: "header", blockquote: "blockquote", button: "button",
  caption: "caption", cell: "td", code: "code", contentinfo: "footer", definition: "dd", deletion: "del",
  dialog: "dialog", document: "html", emphasis: "em", figure: "figure",
  generic: "b bdo body data div hgroup i pre q samp small span u", group: "details fieldset optgroup address",
  heading: "h1 h2 h3 h4 h5 h6", insertion: "ins", list: "menu ol ul", listbox: "datalist", listitem: "li",
  main: "main", mark: "mark", math: "math", meter: "meter", navigation: "nav", option: "option",
  paragraph: "p", progressbar: "progress", row: "tr", rowgroup: "tbody tfoot thead", separator: "hr",
  status: "output", strong: "strong", subscript: "sub", superscript: "sup", table: "table", term: "dfn dt",
  textbox: "textarea", time: "time",
});

/** Sets `table[tag id] = role` for each role's " "-separated tag names. */
function setRoles(table: (string | undefined)[], tagsByRole: Record<string, string>): void {
  for (const role in tagsByRole) for (const name of tagsByRole[role].split(" ")) table[tagId(name)] = role;
}

/**
 * The single implicit role Testing Library 10.4 computes for an element, or "" for none
 * (`getImplicitAriaRoles(el)[0] ?? ""`). Every aria-query@5.3.0 element entry maps to
 * exactly one role, so the list form always has at most one element.
 */
export function implicitRole(impl: NodeImpl): string {
  if (impl.type !== ELEMENT_NODE) return "";
  const fixed = STATIC_IMPLICIT_ROLE[anyTag(impl)];
  if (fixed !== undefined) return fixed;
  const version = impl.doc[$version];
  const cache = nodeCache(impl);
  if (cache.roleVersion !== version) {
    cache.role = implicitRoleImpl(impl, false);
    cache.roleVersion = version;
  }
  return cache.role;
}

export function roleAttribute(impl: NodeImpl): string | null {
  return (impl.flags & F_ROLE_ATTR) === 0 ? null : attr(impl, "role");
}

/** jest-dom@7's `getImplicitAriaRoles` variant (see module comment). */
export function implicitRoleJestDom(impl: NodeImpl): string {
  return implicitRoleImpl(impl, true);
}

function implicitRoleImpl(impl: NodeImpl, jd: boolean): string {
  if (impl.type !== ELEMENT_NODE) return "";
  const tag = anyTag(impl);
  switch (tag) {
    case T.input:
      return inputRole(impl, jd);
    case T.select:
      // select:not([multiple]):not([size]) → combobox; select[size] / select[multiple] → listbox
      return attr(impl, "multiple") === null && attr(impl, "size") === null ? "combobox" : "listbox";
    case T.th: {
      const scope = attr(impl, "scope");
      if (eqCI(scope, "col") || eqCI(scope, "colgroup")) return "columnheader";
      if (eqCI(scope, "row") || eqCI(scope, "rowgroup")) return "rowheader";
      return "columnheader";
    }
    case T.form:
      if (jd) {
        return ariaAttr(impl, "aria-label") !== null ||
          ariaAttr(impl, "aria-labelledby") !== null ||
          attr(impl, "name") !== null
          ? "form"
          : "";
      }
      return isSet(impl, "aria-label") || isSet(impl, "aria-labelledby") || isSet(impl, "name") ? "form" : "";
    case T.img: {
      if (jd) return "img"; // img[alt] (from both "set" and `alt=""`) or img:not([alt])
      const alt = attr(impl, "alt");
      return alt === "" ? "presentation" : "img";
    }
    case T.a:
    case T.area:
      if (jd) return attr(impl, "href") !== null ? "link" : "generic";
      return isSet(impl, "href") ? "link" : "generic";
    case T.section:
      if (jd)
        return ariaAttr(impl, "aria-label") !== null || ariaAttr(impl, "aria-labelledby") !== null
          ? "region"
          : "generic";
      return isSet(impl, "aria-label") || isSet(impl, "aria-labelledby") ? "region" : "generic";
    default:
      // Tags whose role never depends on attributes.
      return STATIC_IMPLICIT_ROLE[tag]!;
  }
}

function inputRole(impl: NodeImpl, jd: boolean): string {
  const list = attr(impl, "list");
  const typeAttr = attr(impl, "type");
  // `node.type === "text"` (only HTML input elements have a `type` IDL attribute)
  const typeIsText = impl.ns === HTML_NS && inputType(impl) === "text";
  const listSet = jd ? list !== null : list !== null && list !== "";
  // input[list][type=email|search|tel|text|url] → combobox
  if (
    listSet &&
    (typeIsText ||
      eqCI(typeAttr, "email") ||
      eqCI(typeAttr, "search") ||
      eqCI(typeAttr, "tel") ||
      eqCI(typeAttr, "url"))
  ) {
    return "combobox";
  }
  if (list === null) {
    if (eqCI(typeAttr, "search")) return "searchbox";
    if (typeAttr === null) return "textbox"; // input:not([type]):not([list])
    if (typeIsText || eqCI(typeAttr, "email") || eqCI(typeAttr, "tel") || eqCI(typeAttr, "url")) return "textbox";
  }
  if (typeAttr === null) return "";
  switch (typeAttr.toLowerCase()) {
    case "button":
    case "image":
    case "reset":
    case "submit":
      return "button";
    case "checkbox":
      return "checkbox";
    case "radio":
      return "radio";
    case "range":
      return "slider";
    case "number":
      return "spinbutton";
    default:
      return "";
  }
}

/** Testing Library's `getImplicitAriaRoles(el)`: a fresh array of zero or one role. */
export function getImplicitRoles(impl: NodeImpl): string[] {
  const r = implicitRole(impl);
  return r === "" ? [] : [r];
}

/**
 * The role Testing Library matches `*ByRole` against without `queryFallbacks`: the first
 * " "-separated token of the role attribute when present (possibly ""), else the implicit
 * role ("" for none).
 */
export function tlRole(impl: NodeImpl): string {
  if (impl.type !== ELEMENT_NODE) return "";
  const role = roleAttribute(impl);
  if (role !== null) {
    const sp = role.indexOf(" ");
    return sp === -1 ? role : role.slice(0, sp);
  }
  return implicitRole(impl);
}

// -----------------------------------------------------------------------------------------
// dom-accessibility-api getRole (0.5.16 / 0.6.3).

/** dom-accessibility-api flavor: 5 = 0.5.16 (Testing Library 10.4), 6 = 0.6.3 (jest-dom 7). */
export type Flavor = 5 | 6;

/** dom-accessibility-api's localNameToRoleMappings, by tag id. */
const DAA_ROLE_BY_TAG: string[] = [];
// oxfmt-ignore
setRoles(DAA_ROLE_BY_TAG, {
  article: "article", complementary: "aside", button: "button summary", listbox: "datalist", definition: "dd",
  group: "details fieldset optgroup", dialog: "dialog", term: "dt", figure: "figure", form: "form",
  contentinfo: "footer", heading: "h1 h2 h3 h4 h5 h6", banner: "header", separator: "hr", document: "html",
  legend: "legend", listitem: "li", math: "math", main: "main", list: "menu ol ul", navigation: "nav",
  option: "option", status: "output", progressbar: "progress", region: "section", table: "table",
  rowgroup: "tbody tfoot thead", textbox: "textarea", cell: "td", columnheader: "th", row: "tr",
});

/** https://rawgit.com/w3c/aria/stable/#global_states as listed by dom-accessibility-api. */
// oxfmt-ignore
const GLOBAL_ARIA_05 = [
  "aria-atomic", "aria-busy", "aria-controls", "aria-current", "aria-describedby", "aria-details",
  "aria-dropeffect", "aria-flowto", "aria-grabbed", "aria-hidden", "aria-keyshortcuts", "aria-label",
  "aria-labelledby", "aria-live", "aria-owns", "aria-relevant", "aria-roledescription",
];
const GLOBAL_ARIA_06 = GLOBAL_ARIA_05.toSpliced(4, 0, "aria-description");

function isProhibited(role: string, name: string, flavor: Flavor): boolean {
  switch (role) {
    case "caption":
    case "code":
    case "deletion":
    case "emphasis":
    case "insertion":
    case "paragraph":
    case "presentation":
    case "strong":
    case "subscript":
    case "superscript":
      return name === "aria-label" || name === "aria-labelledby";
    case "none":
      return flavor === 6 && (name === "aria-label" || name === "aria-labelledby");
    case "generic":
      return name === "aria-label" || name === "aria-labelledby" || name === "aria-roledescription";
    default:
      return false;
  }
}

function hasGlobalAriaAttributes(impl: NodeImpl, role: string, flavor: Flavor): boolean {
  const attrs = impl.attrs;
  if (attrs === null) return false;
  const list = flavor === 6 ? GLOBAL_ARIA_06 : GLOBAL_ARIA_05;
  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    if (attr(impl, name) !== null && !isProhibited(role, name, flavor)) return true;
  }
  return false;
}

/** dom-accessibility-api getExplicitRole: first " "-token of the trimmed role attribute, null when empty. */
export function daaExplicitRole(impl: NodeImpl): string | null {
  const role = roleAttribute(impl);
  if (role === null) return null;
  const trimmed = role.trim();
  const sp = trimmed.indexOf(" ");
  const first = sp === -1 ? trimmed : trimmed.slice(0, sp);
  return first.length > 0 ? first : null;
}

/** dom-accessibility-api getImplicitRole. */
export function daaImplicitRole(impl: NodeImpl, flavor: Flavor): string | null {
  const tag = anyTag(impl);
  const mapped = DAA_ROLE_BY_TAG[tag];
  if (mapped !== undefined) return mapped;
  switch (tag) {
    case T.a:
    case T.area:
    case T.link:
      return attr(impl, "href") !== null ? "link" : null;
    case T.img:
      return attr(impl, "alt") === "" && !hasGlobalAriaAttributes(impl, "img", flavor) ? "presentation" : "img";
    case T.input: {
      if (impl.ns !== HTML_NS) return null; // `element.type` is undefined
      const type = inputType(impl);
      switch (type) {
        case "button":
        case "image":
        case "reset":
        case "submit":
          return "button";
        case "checkbox":
        case "radio":
          return type;
        case "range":
          return "slider";
        case "email":
        case "tel":
        case "text":
        case "url":
          return attr(impl, "list") !== null ? "combobox" : "textbox";
        case "search":
          return attr(impl, "list") !== null ? "combobox" : "searchbox";
        case "number":
          return "spinbutton";
        default:
          return null;
      }
    }
    case T.select:
      if (attr(impl, "multiple") !== null || (impl.ns === HTML_NS && selectSize(impl) > 1)) return "listbox";
      return "combobox";
  }
  return null;
}

function isPresentationRole(role: string | null, flavor: Flavor): boolean {
  return role === "presentation" || (flavor === 6 && role === "none");
}

/** dom-accessibility-api `getRole(element)`. */
export function daaGetRole(impl: NodeImpl, flavor: Flavor): string | null {
  const explicitRole = daaExplicitRole(impl);
  if (explicitRole === null || isPresentationRole(explicitRole, flavor)) {
    const implicit = daaImplicitRole(impl, flavor);
    if (!isPresentationRole(explicitRole, flavor) || hasGlobalAriaAttributes(impl, implicit ?? "", flavor)) {
      return implicit;
    }
  }
  return explicitRole;
}
