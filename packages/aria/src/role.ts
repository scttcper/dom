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
  HTML_NS,
  T,
  attr,
  nodeCache,
  tagId,
  type NodeCache,
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

/**
 * The single implicit role Testing Library 10.4 computes for an element, or "" for none
 * (`getImplicitAriaRoles(el)[0] ?? ""`). Every aria-query@5.3.0 element entry maps to
 * exactly one role, so the list form always has at most one element.
 */
export function implicitRole(impl: NodeImpl): string {
  if (impl.type !== ELEMENT_NODE) return "";
  const c = roleCache(impl);
  if (c.role === NOT_COMPUTED) c.role = implicitRoleImpl(impl, false);
  return c.role;
}

/** NodeCache.role of an element with a `role` attribute until something asks for the implicit role. */
const NOT_COMPUTED = "\0";

/**
 * The element's cache with its `role` attribute current, and its Testing Library implicit role
 * when it has no `role` attribute (else NOT_COMPUTED: ByRole matches against the attribute then):
 * every ByRole query asks for them for every element in the container, and both depend only on
 * the tag and attributes, so they are kept per document version.
 */
export function roleCache(impl: NodeImpl): NodeCache {
  const version = impl.doc[$version];
  const c = impl.cache as NodeCache | null;
  if (c !== null && c.roleVersion === version) return c;
  const cache = c ?? nodeCache(impl);
  const roleAttr = attr(impl, "role");
  cache.roleAttr = roleAttr;
  cache.role = roleAttr === null ? implicitRoleImpl(impl, false) : NOT_COMPUTED;
  cache.roleVersion = version;
  return cache;
}

/** jest-dom@7's `getImplicitAriaRoles` variant (see module comment). */
export function implicitRoleJestDom(impl: NodeImpl): string {
  return implicitRoleImpl(impl, true);
}

function implicitRoleImpl(impl: NodeImpl, jd: boolean): string {
  if (impl.type !== ELEMENT_NODE) return "";
  const tag = anyTag(impl);
  switch (tag) {
    case 0:
      return "";
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
    case T.aside:
      return "complementary";
    case T.form:
      if (jd) {
        return attr(impl, "aria-label") !== null ||
          attr(impl, "aria-labelledby") !== null ||
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
      if (jd) return attr(impl, "aria-label") !== null || attr(impl, "aria-labelledby") !== null ? "region" : "generic";
      return isSet(impl, "aria-label") || isSet(impl, "aria-labelledby") ? "region" : "generic";
    case T.article:
      return "article";
    case T.header:
      return "banner";
    case T.blockquote:
      return "blockquote";
    case T.button:
      return "button";
    case T.caption:
      return "caption";
    case T.td:
      return "cell";
    case T.code:
      return "code";
    case T.footer:
      return "contentinfo";
    case T.dd:
      return "definition";
    case T.del:
      return "deletion";
    case T.dialog:
      return "dialog";
    case T.html:
      return "document";
    case T.em:
      return "emphasis";
    case T.figure:
      return "figure";
    case T.b:
    case T.bdo:
    case T.body:
    case T.data:
    case T.div:
    case T.hgroup:
    case T.i:
    case T.pre:
    case T.q:
    case T.samp:
    case T.small:
    case T.span:
    case T.u:
      return "generic";
    case T.details:
    case T.fieldset:
    case T.optgroup:
    case T.address:
      return "group";
    case T.h1:
    case T.h2:
    case T.h3:
    case T.h4:
    case T.h5:
    case T.h6:
      return "heading";
    case T.ins:
      return "insertion";
    case T.menu:
    case T.ol:
    case T.ul:
      return "list";
    case T.datalist:
      return "listbox";
    case T.li:
      return "listitem";
    case T.main:
      return "main";
    case T.mark:
      return "mark";
    case T.math:
      return "math";
    case T.meter:
      return "meter";
    case T.nav:
      return "navigation";
    case T.option:
      return "option";
    case T.p:
      return "paragraph";
    case T.progress:
      return "progressbar";
    case T.tr:
      return "row";
    case T.tbody:
    case T.tfoot:
    case T.thead:
      return "rowgroup";
    case T.hr:
      return "separator";
    case T.output:
      return "status";
    case T.strong:
      return "strong";
    case T.sub:
      return "subscript";
    case T.sup:
      return "superscript";
    case T.table:
      return "table";
    case T.dfn:
    case T.dt:
      return "term";
    case T.textarea:
      return "textbox";
    case T.time:
      return "time";
    default:
      return "";
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
  const c = roleCache(impl);
  const role = c.roleAttr;
  if (role !== null) {
    const sp = role.indexOf(" ");
    return sp === -1 ? role : role.slice(0, sp);
  }
  return c.role;
}

// -----------------------------------------------------------------------------------------
// dom-accessibility-api getRole (0.5.16 / 0.6.3).

/** dom-accessibility-api flavor: 5 = 0.5.16 (Testing Library 10.4), 6 = 0.6.3 (jest-dom 7). */
export type Flavor = 5 | 6;

/** dom-accessibility-api's localNameToRoleMappings, by tag id. */
const DAA_ROLE_BY_TAG: string[] = [];
{
  const m: Record<string, string> = {
    article: "article",
    aside: "complementary",
    button: "button",
    datalist: "listbox",
    dd: "definition",
    details: "group",
    dialog: "dialog",
    dt: "term",
    fieldset: "group",
    figure: "figure",
    form: "form",
    footer: "contentinfo",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    header: "banner",
    hr: "separator",
    html: "document",
    legend: "legend",
    li: "listitem",
    math: "math",
    main: "main",
    menu: "list",
    nav: "navigation",
    ol: "list",
    optgroup: "group",
    option: "option",
    output: "status",
    progress: "progressbar",
    section: "region",
    summary: "button",
    table: "table",
    tbody: "rowgroup",
    textarea: "textbox",
    tfoot: "rowgroup",
    td: "cell",
    th: "columnheader",
    thead: "rowgroup",
    tr: "row",
    ul: "list",
  };
  for (const [name, role] of Object.entries(m)) DAA_ROLE_BY_TAG[tagId(name)] = role;
}

/** https://rawgit.com/w3c/aria/stable/#global_states as listed by dom-accessibility-api. */
// oxfmt-ignore
const GLOBAL_ARIA_05 = [
  "aria-atomic", "aria-busy", "aria-controls", "aria-current", "aria-describedby", "aria-details",
  "aria-dropeffect", "aria-flowto", "aria-grabbed", "aria-hidden", "aria-keyshortcuts", "aria-label",
  "aria-labelledby", "aria-live", "aria-owns", "aria-relevant", "aria-roledescription",
];
// oxfmt-ignore
const GLOBAL_ARIA_06 = [
  "aria-atomic", "aria-busy", "aria-controls", "aria-current", "aria-description", "aria-describedby",
  "aria-details", "aria-dropeffect", "aria-flowto", "aria-grabbed", "aria-hidden", "aria-keyshortcuts",
  "aria-label", "aria-labelledby", "aria-live", "aria-owns", "aria-relevant", "aria-roledescription",
];

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
  const role = attr(impl, "role");
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
