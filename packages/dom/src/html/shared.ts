// Small predicates shared by src/html modules (focus, innerText, HTMLElement).

import { DOCUMENT_NODE, ELEMENT_NODE, F_CONTENTEDITABLE_ATTR, HTML_NS } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { contentAttr } from "./reflect.ts";
import { asciiLowercase } from "../nodes/attributes.ts";
import { isDisplayNone, isDisplayNoneInclusive } from "../css/internal.ts";

// --- rendering ----------------------------------------------------------------------------

/**
 * "Not being rendered" for focus (https://html.spec.whatwg.org/#being-rendered): display:none on
 * the element or a flat-tree ancestor, from the css area's cached fast path (UA defaults such as
 * [hidden] and <head> included; author style sheets and inline styles when present).
 */
export function isRenderingHidden(impl: NodeImpl): boolean {
  return isDisplayNoneInclusive(impl);
}

/** The element's own computed display is none (ancestors not considered). */
export function isOwnDisplayNone(impl: NodeImpl): boolean {
  return isDisplayNone(impl);
}

// --- editing ------------------------------------------------------------------------------

const CE_TRUE = 1;
const CE_FALSE = 0;
const CE_INHERIT = -1;
const CE_PLAINTEXT = 2;

/** https://html.spec.whatwg.org/#attr-contenteditable state of an element's own attribute. */
export function contentEditableState(impl: NodeImpl): number {
  if ((impl.flags & F_CONTENTEDITABLE_ATTR) === 0) return CE_INHERIT;
  const v = contentAttr(impl, "contenteditable");
  if (v === null) return CE_INHERIT;
  switch (asciiLowercase(v)) {
    case "":
    case "true":
      return CE_TRUE;
    case "false":
      return CE_FALSE;
    case "plaintext-only":
      return CE_PLAINTEXT;
  }
  return CE_INHERIT;
}

// Documents whose design mode enabled is true (https://html.spec.whatwg.org/#design-mode-enabled).
// `designModeUsed` keeps the editability walks free of the WeakSet lookup until a test turns
// design mode on somewhere.
const designModeDocs = new WeakSet<object>();
let designModeUsed = false;

/** https://html.spec.whatwg.org/#dom-document-designmode (getter). */
export function isDesignModeEnabled(doc: object): boolean {
  return designModeUsed && designModeDocs.has(doc);
}

/** https://html.spec.whatwg.org/#dom-document-designmode (setter steps 1–2). */
export function setDesignModeEnabled(doc: object, enabled: boolean): void {
  if (enabled) {
    designModeUsed = true;
    designModeDocs.add(doc);
  } else designModeDocs.delete(doc);
}

/** A child HTML element of a Document whose design mode enabled is true. */
function isDesignModeRoot(impl: NodeImpl, parent: NodeImpl): boolean {
  return designModeUsed && parent.type === DOCUMENT_NODE && impl.ns === HTML_NS && designModeDocs.has(parent.node);
}

/**
 * https://html.spec.whatwg.org/#editable — the element is an editing host or inside one (what
 * isContentEditable reports).
 */
export function isEditable(impl: NodeImpl): boolean {
  if (impl.type !== ELEMENT_NODE) return false;
  for (let n = impl; ;) {
    if (n.ns === HTML_NS) {
      const s = contentEditableState(n);
      if (s === CE_TRUE || s === CE_PLAINTEXT) return true;
      if (s === CE_FALSE) return false;
    }
    const p = n.parent;
    if (p === null) return false;
    // https://html.spec.whatwg.org/#editing-host: in design mode the document element is one.
    if (p.type !== ELEMENT_NODE) return isDesignModeRoot(n, p);
    n = p;
  }
}

/** https://html.spec.whatwg.org/#editing-host */
export function isEditingHost(impl: NodeImpl): boolean {
  if (impl.ns !== HTML_NS) return false;
  const p = impl.parent;
  if (p !== null && isDesignModeRoot(impl, p)) return true;
  const s = contentEditableState(impl);
  if (s !== CE_TRUE && s !== CE_PLAINTEXT) return false;
  return p === null || p.type !== ELEMENT_NODE || !isEditable(p);
}
