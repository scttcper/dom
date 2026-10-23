// Small predicates shared by src/html modules (focus, innerText, HTMLElement).

import { ELEMENT_NODE, HTML_NS } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { contentAttr } from "./reflect.ts";
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
  const v = contentAttr(impl, "contenteditable");
  if (v === null) return CE_INHERIT;
  switch (v.toLowerCase()) {
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

/** https://html.spec.whatwg.org/#editable — the element is inside an editing host. */
export function isEditable(impl: NodeImpl): boolean {
  for (let n: NodeImpl | null = impl; n !== null && n.type === ELEMENT_NODE; n = n.parent) {
    if (n.ns !== HTML_NS) continue;
    const s = contentEditableState(n);
    if (s === CE_TRUE || s === CE_PLAINTEXT) return true;
    if (s === CE_FALSE) return false;
  }
  return false;
}

/** https://html.spec.whatwg.org/#editing-host */
export function isEditingHost(impl: NodeImpl): boolean {
  if (impl.ns !== HTML_NS) return false;
  const s = contentEditableState(impl);
  if (s !== CE_TRUE && s !== CE_PLAINTEXT) return false;
  const p = impl.parent;
  return p === null || p.type !== ELEMENT_NODE || !isEditable(p);
}
