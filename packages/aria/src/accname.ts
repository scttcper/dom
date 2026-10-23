// Accessible name and description computation.
//
// Spec: https://w3c.github.io/accname/#computation-steps (as implemented by
// dom-accessibility-api@0.5.16 / 0.6.3 — the observable behavior Testing Library and
// jest-dom users' tests assert, including its documented deviations from the spec).
// Ported from https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/accessible-name-and-description.ts
// (MIT, Sebastian Silbermann) onto NodeImpl.
//
// Related:
//   https://w3c.github.io/html-aam/#accessible-name-computations-by-html-element
//   https://www.w3.org/TR/svg-aam-1.0/#mapping_additional_nd

import {
  ELEMENT_NODE,
  HTML_NS,
  SVG_NS,
  TEXT_NODE,
  T,
  attr,
  nodeCache,
  type AttrRecord,
  type NodeCache,
  type NodeImpl,
} from "@rtd/dom/internal";
import type { Element, Node } from "@rtd/dom";
import { daaGetRole, anyTag, type Flavor } from "./role.ts";
import { controlValue, inputType, labelsOf, selectedOptions } from "./forms.ts";
import { queryIdRefs, textContent } from "./tree.ts";
import { isDisplayInline, isDisplayNone, isVisibilityHidden, pseudoText } from "./style.ts";
import { $impl, $styleVersion, $version, getComputedStyleOverride } from "@rtd/dom/internal";

/** Minimal CSSStyleDeclaration shape read from a user-supplied `getComputedStyle`. */
export interface StyleLike {
  getPropertyValue(property: string): string;
  [property: string]: unknown;
}
export type GetComputedStyle = (element: Element, pseudoElement?: string) => StyleLike;

/** dom-accessibility-api's `ComputeTextAlternativeOptions`. */
export interface ComputeTextAlternativeOptions {
  compute?: "description" | "name";
  /** Set to true if getComputedStyle supports the second (pseudo-element) argument. */
  computedStyleSupportsPseudoElements?: boolean;
  /** Mock `window.getComputedStyle`. Needs `content`, `display` and `visibility`. */
  getComputedStyle?: GetComputedStyle;
  /** Include hidden elements (skips step 2A). */
  hidden?: boolean;
}

const COMPUTE_NAME = 0;
const COMPUTE_DESCRIPTION = 1;

/** Per-computation state (one per top-level call). */
class Ctx {
  consulted: Set<NodeImpl | AttrRecord>;
  compute: number;
  hidden: boolean;
  pseudo: boolean;
  gcs: GetComputedStyle | null;
  flavor: Flavor;
  /** Set when a dynamic form-control state (value, selectedness) was read: the result must not be cached. */
  usedState: boolean;
  constructor(compute: number, options: ComputeTextAlternativeOptions | undefined, flavor: Flavor) {
    this.consulted = new Set();
    this.compute = compute;
    const gcs = options?.getComputedStyle;
    this.gcs = typeof gcs === "function" ? gcs : null;
    this.pseudo = options?.computedStyleSupportsPseudoElements ?? this.gcs !== null;
    this.hidden = options?.hidden ?? false;
    this.flavor = flavor;
    this.usedState = false;
  }
}

// --- role helpers (dom-accessibility-api's hasAnyConcreteRoles) ---------------------------

function roleOf(ctx: Ctx, n: NodeImpl): string | null {
  return n.type === ELEMENT_NODE ? daaGetRole(n, ctx.flavor) : null;
}

/** 2E: https://w3c.github.io/accname/#step2E — button, combobox, listbox, textbox, range. */
function isControl(role: string | null): boolean {
  switch (role) {
    case "button":
    case "combobox":
    case "listbox":
    case "textbox":
      return true;
    default:
      return isRange(role);
  }
}

function isRange(role: string | null): boolean {
  switch (role) {
    case "meter":
    case "progressbar":
    case "scrollbar":
    case "slider":
    case "spinbutton":
      return true;
    default:
      return false;
  }
}

/** https://w3c.github.io/aria/#namefromcontent (dom-accessibility-api's list). */
function allowsNameFromContent(role: string | null): boolean {
  switch (role) {
    case "button":
    case "cell":
    case "checkbox":
    case "columnheader":
    case "gridcell":
    case "heading":
    case "label":
    case "legend":
    case "link":
    case "menuitem":
    case "menuitemcheckbox":
    case "menuitemradio":
    case "option":
    case "radio":
    case "row":
    case "rowheader":
    case "switch":
    case "tab":
    case "tooltip":
    case "treeitem":
      return true;
    default:
      return false;
  }
}

// --- style access ----------------------------------------------------------------------

function wrapperOf(n: NodeImpl): Element {
  return n.node as unknown as Element;
}

/** dom-accessibility-api isHidden (2A). */
function isHidden(ctx: Ctx, n: NodeImpl): boolean {
  if (n.type !== ELEMENT_NODE) return false;
  if (attr(n, "hidden") !== null || attr(n, "aria-hidden") === "true") return true;
  const gcs = ctx.gcs;
  if (gcs !== null) {
    const style = gcs(wrapperOf(n));
    return style.getPropertyValue("display") === "none" || style.getPropertyValue("visibility") === "hidden";
  }
  return isDisplayNone(n) || isVisibilityHidden(n);
}

function displayIsInline(ctx: Ctx, n: NodeImpl): boolean {
  const gcs = ctx.gcs;
  if (gcs !== null) return gcs(wrapperOf(n)).getPropertyValue("display") === "inline";
  return isDisplayInline(n);
}

/** getTextualContent(getComputedStyle(node, pseudo)) */
function pseudoContent(ctx: Ctx, n: NodeImpl, pseudo: "::before" | "::after"): string {
  const gcs = ctx.gcs;
  if (gcs !== null) {
    const content = gcs(wrapperOf(n), pseudo).getPropertyValue("content");
    if (/^["'].*["']$/.test(content)) return content.slice(1, -1);
    return "";
  }
  return pseudoText(n, pseudo);
}

// --- element kinds (dom-accessibility-api checks localName regardless of namespace) -------

function isLocal(n: NodeImpl, tag: number): boolean {
  return n.type === ELEMENT_NODE && anyTag(n) === tag;
}

/** `input.type` for HTML inputs; "" for other elements (their `type` is undefined). */
function htmlInputType(n: NodeImpl): string {
  return n.ns === HTML_NS && n.tag === T.input ? inputType(n) : "";
}

function findAttr(n: NodeImpl, name: string): AttrRecord | null {
  const attrs = n.attrs;
  if (attrs === null) return null;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if ((a.rare === null ? a.localName : a.rare.name) === name) return a;
  }
  return null;
}

/** useAttribute: a non-blank attribute that has not been consulted yet. */
function useAttribute(ctx: Ctx, n: NodeImpl, name: string): string | null {
  const a = findAttr(n, name);
  if (a !== null && !ctx.consulted.has(a) && a.value.trim() !== "") {
    ctx.consulted.add(a);
    return a.value;
  }
  return null;
}

// --- the computation ---------------------------------------------------------------------

/** 2F.i: name from content (plus aria-owns, slots and CSS generated content). */
function computeMiscTextAlternative(ctx: Ctx, node: NodeImpl, isEmbeddedInLabel: boolean): string {
  let accumulatedText = "";
  const isEl = node.type === ELEMENT_NODE;
  if (isEl && ctx.pseudo) {
    accumulatedText = `${pseudoContent(ctx, node, "::before")} ${accumulatedText}`;
  }

  if (isEl && anyTag(node) === T.slot) {
    // https://html.spec.whatwg.org/multipage/scripting.html#dom-slot-assignednodes
    const assigned = slotAssignedNodes(node);
    if (assigned !== null && assigned.length > 0) {
      for (let i = 0; i < assigned.length; i++) accumulatedText += childText(ctx, assigned[i], isEmbeddedInLabel);
    } else {
      for (let c = node.first; c !== null; c = c.next) accumulatedText += childText(ctx, c, isEmbeddedInLabel);
    }
  } else {
    for (let c = node.first; c !== null; c = c.next) accumulatedText += childText(ctx, c, isEmbeddedInLabel);
    // FIXME (upstream): including aria-owns is not defined in the spec but required by WPT.
    if (isEl) {
      const owns = attr(node, "aria-owns");
      if (owns !== null) {
        const owned = queryIdRefs(node, owns, []);
        for (let i = 0; i < owned.length; i++) accumulatedText += childText(ctx, owned[i], isEmbeddedInLabel);
      }
    }
  }

  if (isEl && ctx.pseudo) {
    accumulatedText = `${accumulatedText} ${pseudoContent(ctx, node, "::after")}`;
  }
  return accumulatedText.trim();
}

function childText(ctx: Ctx, child: NodeImpl, isEmbeddedInLabel: boolean): string {
  const result = computeTextAlternative(ctx, child, isEmbeddedInLabel, false, true);
  // TODO (upstream): unclear why display affects the delimiter, see https://github.com/w3c/accname/issues/3
  if (child.type === ELEMENT_NODE && !displayIsInline(ctx, child)) return ` ${result} `;
  return result;
}

function slotAssignedNodes(slot: NodeImpl): NodeImpl[] | null {
  const fn = (slot.node as unknown as { assignedNodes?: () => ArrayLike<Node> }).assignedNodes;
  if (typeof fn !== "function") return null;
  const nodes = fn.call(slot.node);
  const out: NodeImpl[] = [];
  for (let i = 0; i < nodes.length; i++) out.push((nodes[i] as unknown as { [$impl]: NodeImpl })[$impl]);
  return out;
}

function computeTooltipAttributeValue(ctx: Ctx, n: NodeImpl): string | null {
  if (n.type !== ELEMENT_NODE) return null;
  return useAttribute(ctx, n, "title");
}

/** 2D: native host-language text alternatives (html-aam, svg-aam). */
function computeElementTextAlternative(ctx: Ctx, node: NodeImpl): string | null {
  if (node.type !== ELEMENT_NODE) return null;
  const tag = anyTag(node);

  if (tag === T.fieldset) {
    // https://w3c.github.io/html-aam/#fieldset-and-legend-elements
    ctx.consulted.add(node);
    for (let c = node.first; c !== null; c = c.next) {
      if (isLocal(c, T.legend)) return computeTextAlternative(ctx, c, false, false, false);
    }
  } else if (tag === T.table) {
    // https://w3c.github.io/html-aam/#table-element
    ctx.consulted.add(node);
    for (let c = node.first; c !== null; c = c.next) {
      if (isLocal(c, T.caption)) return computeTextAlternative(ctx, c, false, false, false);
    }
  } else if (tag === T.svg) {
    // https://www.w3.org/TR/svg-aam-1.0/
    ctx.consulted.add(node);
    for (let c = node.first; c !== null; c = c.next) {
      if (c.type === ELEMENT_NODE && c.ns === SVG_NS && c.name === "title") return textContent(c);
    }
    return null;
  } else if (tag === T.img || tag === T.area) {
    // https://w3c.github.io/html-aam/#area-element, https://w3c.github.io/html-aam/#img-element
    const nameFromAlt = useAttribute(ctx, node, "alt");
    if (nameFromAlt !== null) return nameFromAlt;
  } else if (tag === T.optgroup) {
    const nameFromLabel = useAttribute(ctx, node, "label");
    if (nameFromLabel !== null) return nameFromLabel;
  }

  const type = tag === T.input ? htmlInputType(node) : "";
  if (type === "button" || type === "submit" || type === "reset") {
    // https://w3c.github.io/html-aam/#input-type-button-input-type-submit-and-input-type-reset-accessible-name-computation
    const nameFromValue = useAttribute(ctx, node, "value");
    if (nameFromValue !== null) return nameFromValue;
    if (type === "submit") return "Submit"; // TODO (upstream): l10n
    if (type === "reset") return "Reset";
  }

  const labels = labelsOf(node);
  if (labels !== null && labels.length !== 0) {
    ctx.consulted.add(node);
    let out = "";
    for (let i = 0; i < labels.length; i++) {
      const label = computeTextAlternative(ctx, labels[i], true, false, true);
      if (label.length > 0) out = out === "" ? label : `${out} ${label}`;
    }
    return out;
  }

  // https://w3c.github.io/html-aam/#input-type-image-accessible-name-computation
  if (type === "image") {
    const nameFromAlt = useAttribute(ctx, node, "alt");
    if (nameFromAlt !== null) return nameFromAlt;
    const nameFromTitle = useAttribute(ctx, node, "title");
    if (nameFromTitle !== null) return nameFromTitle;
    return "Submit Query"; // TODO (upstream): l10n
  }

  if (roleOf(ctx, node) === "button") {
    // https://www.w3.org/TR/html-aam-1.0/#button-element
    const nameFromSubTree = computeMiscTextAlternative(ctx, node, false);
    if (nameFromSubTree !== "") return nameFromSubTree;
  }
  return null;
}

/** querySelectedOptions(listbox) */
function selectedOptionsOf(ctx: Ctx, listbox: NodeImpl): NodeImpl[] {
  if (anyTag(listbox) === T.select) {
    ctx.usedState = true;
    if (listbox.ns === HTML_NS) return selectedOptions(listbox);
    return querySelectorAllSubtree(listbox, "selected", null);
  }
  return querySelectorAllSubtree(listbox, "aria-selected", "true");
}

/** `element.querySelectorAll("[name]")` / `[name="value"]` over the element and its aria-owns roots' descendants. */
function querySelectorAllSubtree(el: NodeImpl, name: string, value: string | null): NodeImpl[] {
  const out: NodeImpl[] = [];
  collectDescendantsWithAttr(el, name, value, out);
  const owns = attr(el, "aria-owns");
  if (owns !== null) {
    const roots = queryIdRefs(el, owns, []);
    for (let i = 0; i < roots.length; i++) collectDescendantsWithAttr(roots[i], name, value, out);
  }
  return out;
}

function collectDescendantsWithAttr(root: NodeImpl, name: string, value: string | null, out: NodeImpl[]): void {
  for (let n = root.first; n !== null; ) {
    if (n.type === ELEMENT_NODE) {
      const v = attr(n, name);
      if (v !== null && (value === null || v === value)) out.push(n);
    }
    if (n.first !== null) n = n.first;
    else {
      let cur: NodeImpl | null = n;
      n = null;
      while (cur !== null && cur !== root) {
        if (cur.next !== null) {
          n = cur.next;
          break;
        }
        cur = cur.parent;
      }
    }
  }
}

function getValueOfTextbox(ctx: Ctx, el: NodeImpl): string {
  const tag = anyTag(el);
  if ((tag === T.input || tag === T.textarea) && el.ns === HTML_NS) {
    ctx.usedState = true;
    return controlValue(el);
  }
  // https://github.com/eps1lon/dom-accessibility-api/issues/4
  return textContent(el);
}

function computeTextAlternative(
  ctx: Ctx,
  current: NodeImpl,
  isEmbeddedInLabel: boolean,
  isReferenced: boolean,
  recursion: boolean,
): string {
  const consulted = ctx.consulted;
  if (consulted.has(current)) return "";

  // 2A: https://w3c.github.io/accname/#step2A
  if (!ctx.hidden && !isReferenced && isHidden(ctx, current)) {
    consulted.add(current);
    return "";
  }

  const isEl = current.type === ELEMENT_NODE;

  // 2B: https://w3c.github.io/accname/#step2B
  if (isEl && ctx.compute === COMPUTE_NAME && !isReferenced) {
    const labelAttr = findAttr(current, "aria-labelledby");
    if (labelAttr !== null && !consulted.has(labelAttr)) {
      const labelElements = queryIdRefs(current, labelAttr.value, []);
      if (labelElements.length > 0) {
        consulted.add(labelAttr);
        let out = "";
        for (let i = 0; i < labelElements.length; i++) {
          // TODO (upstream): Chrome will consider repeated values i.e. use a node multiple times.
          // Not recursion as specified, otherwise `aria-label` would be skipped in
          // <input id="myself" aria-label="foo" aria-labelledby="myself">.
          const part = computeTextAlternative(ctx, labelElements[i], isEmbeddedInLabel, true, false);
          out = i === 0 ? part : `${out} ${part}`;
        }
        return out;
      }
    }
  }

  const role = isEl ? daaGetRole(current, ctx.flavor) : null;

  // 2C: https://w3c.github.io/accname/#step2C
  // Changed from the spec in anticipation of https://github.com/w3c/accname/issues/64
  const skipToStep2E = recursion && ctx.compute === COMPUTE_NAME && isControl(role);
  if (!skipToStep2E) {
    const ariaLabel = isEl ? (attr(current, "aria-label") ?? "").trim() : "";
    if (ariaLabel !== "" && ctx.compute === COMPUTE_NAME) {
      consulted.add(current);
      return ariaLabel;
    }
    // 2D: https://w3c.github.io/accname/#step2D
    if (role !== "presentation" && role !== "none") {
      const elementTextAlternative = computeElementTextAlternative(ctx, current);
      if (elementTextAlternative !== null) {
        consulted.add(current);
        return elementTextAlternative;
      }
    }
  }

  // special casing, cheating to make tests pass: https://github.com/w3c/accname/issues/67
  if (role === "menu") {
    consulted.add(current);
    return "";
  }

  // 2E: https://w3c.github.io/accname/#step2E
  if (skipToStep2E || isEmbeddedInLabel || isReferenced) {
    if (role === "combobox" || role === "listbox") {
      consulted.add(current);
      const selected = selectedOptionsOf(ctx, current);
      if (selected.length === 0) {
        // defined per test `name_heading_combobox`
        if (isLocal(current, T.input)) {
          ctx.usedState = true;
          return current.ns === HTML_NS ? controlValue(current) : "";
        }
        return "";
      }
      let out = "";
      for (let i = 0; i < selected.length; i++) {
        const part = computeTextAlternative(ctx, selected[i], isEmbeddedInLabel, false, true);
        out = i === 0 ? part : `${out} ${part}`;
      }
      return out;
    }
    if (isRange(role)) {
      consulted.add(current);
      const valueText = attr(current, "aria-valuetext");
      if (valueText !== null) return valueText;
      const valueNow = attr(current, "aria-valuenow");
      if (valueNow !== null) return valueNow;
      // Otherwise, use the value as specified by a host language attribute.
      return attr(current, "value") || "";
    }
    if (role === "textbox") {
      consulted.add(current);
      return getValueOfTextbox(ctx, current);
    }
  }

  // 2F: https://w3c.github.io/accname/#step2F
  if (allowsNameFromContent(role) || (isEl && isReferenced) || (isEl && anyTag(current) === T.caption)) {
    const accumulatedText2F = computeMiscTextAlternative(ctx, current, isEmbeddedInLabel);
    if (accumulatedText2F !== "") {
      consulted.add(current);
      return accumulatedText2F;
    }
  }

  if (current.type === TEXT_NODE) {
    consulted.add(current);
    return current.data;
  }

  if (recursion) {
    consulted.add(current);
    return computeMiscTextAlternative(ctx, current, isEmbeddedInLabel);
  }

  // 2I: https://w3c.github.io/accname/#step2I
  const tooltipAttributeValue = computeTooltipAttributeValue(ctx, current);
  if (tooltipAttributeValue !== null) {
    consulted.add(current);
    return tooltipAttributeValue;
  }

  // TODO (upstream): should this be reachable?
  consulted.add(current);
  return "";
}

/** asFlatString: trim and collapse runs of 2+ whitespace characters to one space. */
function asFlatString(s: string): string {
  return s.trim().replace(/\s\s+/g, " ");
}

/** https://w3c.github.io/accname/#mapping_additional_nd_te */
export function computeTextAlternativeImpl(
  root: NodeImpl,
  options: ComputeTextAlternativeOptions | undefined,
  flavor: Flavor,
): string {
  const ctx = new Ctx(options?.compute === "description" ? COMPUTE_DESCRIPTION : COMPUTE_NAME, options, flavor);
  // by spec computeAccessibleDescription starts with the referenced elements as roots
  return asFlatString(computeTextAlternative(ctx, root, false, ctx.compute === COMPUTE_DESCRIPTION, false));
}

/** https://w3c.github.io/aria/#namefromprohibited */
function prohibitsNaming(role: string | null, flavor: Flavor): boolean {
  switch (role) {
    case "caption":
    case "code":
    case "deletion":
    case "emphasis":
    case "generic":
    case "insertion":
    case "paragraph":
    case "presentation":
    case "strong":
    case "subscript":
    case "superscript":
      return true;
    case "none":
      return flavor === 6;
    default:
      return false;
  }
}

/**
 * dom-accessibility-api defaults `getComputedStyle` to `window.getComputedStyle.bind(window)`,
 * so a user-replaced one (`getComputedStyleOverride`) is what it reads when the caller passes
 * none. Returns `options` unchanged (no allocation) unless a replacement is installed; then
 * the replacement is passed explicitly, keeping upstream's `computedStyleSupportsPseudoElements`
 * default (`false` when the caller did not pass `getComputedStyle`).
 */
export function withStyleOverride(root: NodeImpl, options: ComputeTextAlternativeOptions | undefined): ComputeTextAlternativeOptions | undefined {
  if (options !== undefined && options.getComputedStyle !== undefined) return options;
  const gcs = getComputedStyleOverride(root);
  if (gcs === null) return options;
  return {
    ...options,
    getComputedStyle: gcs as unknown as GetComputedStyle,
    computedStyleSupportsPseudoElements: options?.computedStyleSupportsPseudoElements ?? false,
  };
}

function isDefaultOptions(options: ComputeTextAlternativeOptions | undefined): boolean {
  if (options === undefined) return true;
  return (
    options.getComputedStyle === undefined &&
    options.computedStyleSupportsPseudoElements !== true &&
    options.hidden !== true &&
    options.compute !== "description"
  );
}

/**
 * https://w3c.github.io/accname/#mapping_additional_nd_name
 *
 * With default options (what Testing Library's `name` filter and jest-dom pass) the result
 * is cached on the element, stamped with `Document._version` and `_styleVersion`, unless
 * the computation read dynamic form-control state (values, selectedness), which changes
 * without bumping the document version.
 */
export function computeAccessibleNameImpl(
  root: NodeImpl,
  options: ComputeTextAlternativeOptions | undefined,
  flavor: Flavor,
): string {
  if (root.type === ELEMENT_NODE && prohibitsNaming(daaGetRole(root, flavor), flavor)) return "";
  const cacheable = flavor === 5 && root.type === ELEMENT_NODE && isDefaultOptions(options);
  const doc = root.doc;
  if (cacheable) {
    const c = root.cache as NodeCache | null;
    if (c !== null && c.nameVersion === doc[$version] && c.ariaNameStyleVersion === doc[$styleVersion]) return c.name;
  }
  const ctx = new Ctx(COMPUTE_NAME, options, flavor);
  const name = asFlatString(computeTextAlternative(ctx, root, false, false, false));
  if (cacheable && !ctx.usedState) {
    const c = nodeCache(root);
    c.nameVersion = doc[$version];
    c.ariaNameStyleVersion = doc[$styleVersion];
    c.name = name;
  }
  return name;
}

/** https://w3c.github.io/accname/#mapping_additional_nd_description */
export function computeAccessibleDescriptionImpl(
  root: NodeImpl,
  options: ComputeTextAlternativeOptions | undefined,
  flavor: Flavor,
): string {
  let description = "";
  if (root.type === ELEMENT_NODE) {
    const describedBy = attr(root, "aria-describedby");
    if (describedBy !== null) {
      const refs = queryIdRefs(root, describedBy, []);
      const opts: ComputeTextAlternativeOptions = { ...options, compute: "description" };
      for (let i = 0; i < refs.length; i++) {
        const part = computeTextAlternativeImpl(refs[i], opts, flavor);
        description = i === 0 ? part : `${description} ${part}`;
      }
    }
    // TODO (upstream): technically we need to make sure that node wasn't used for the accessible name.
    // https://w3c.github.io/aria/#aria-description — only when aria-describedby gave nothing (0.6+).
    if (description === "" && flavor === 6) description = attr(root, "aria-description") ?? "";
    // https://www.w3.org/TR/html-aam-1.0/#accessible-name-and-description-computation
    if (description === "") description = attr(root, "title") ?? "";
  }
  return description;
}
