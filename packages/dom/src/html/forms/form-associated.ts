// Form-associated element machinery: categories, form owner, labels, disabledness.
// https://html.spec.whatwg.org/#form-associated-element
// https://html.spec.whatwg.org/#categories
//
// Design: the form owner is computed on demand (nearest ancestor <form>, or the element named
// by the `form` attribute when connected) instead of being stored and reset from insertion /
// removal / attribute-change hooks. Trees built by the parser and by cloning never run those
// hooks, and computing on demand costs one ancestor walk. This matches the "reset the form
// owner" algorithm (https://html.spec.whatwg.org/#reset-the-form-owner). The parser's
// form-element-pointer association (misnested markup like `<form><table><tr><td><input>` or
// a `</form>`-less form) is recorded separately (`parserAssociateForm`) and consulted first.

import { ELEMENT_NODE, F_CONNECTED, F_CONNECT_HOOK, F_FACE, DOCUMENT_NODE } from "../../nodes/constants.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { T } from "../../nodes/tags.ts";
import { attr } from "../../nodes/attributes.ts";
import { nextElementInTree, treeRoot } from "../../nodes/traverse.ts";
import { I_HIDDEN, I_IMAGE, inputType } from "./input-type.ts";
import { $assocGen } from "../../keys.ts";

// --- categories ---------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#category-listed — button, fieldset, input, object, output, select, textarea. */
export function isListed(el: NodeImpl): boolean {
  const t = el.tag;
  return (el.flags & F_FACE) !== 0 || t === T.input || t === T.button || t === T.select || t === T.textarea || t === T.fieldset || t === T.output || t === T.object;
}

/** https://html.spec.whatwg.org/#category-submit — button, input, select, textarea (object is never submitted here). */
export function isSubmittable(el: NodeImpl): boolean {
  const t = el.tag;
  return (el.flags & F_FACE) !== 0 || t === T.input || t === T.button || t === T.select || t === T.textarea;
}

/** https://html.spec.whatwg.org/#category-reset — input, output, select, textarea. */
export function isResettable(el: NodeImpl): boolean {
  const t = el.tag;
  return (el.flags & F_FACE) !== 0 || t === T.input || t === T.select || t === T.textarea || t === T.output;
}

/** https://html.spec.whatwg.org/#category-label — button, input (not hidden), meter, output, progress, select, textarea. */
export function isLabelable(el: NodeImpl): boolean {
  switch (el.tag) {
    case T.button:
    case T.meter:
    case T.output:
    case T.progress:
    case T.select:
    case T.textarea:
      return true;
    case T.input:
      return inputType(el) !== I_HIDDEN;
  }
  return (el.flags & F_FACE) !== 0;
}

/** https://html.spec.whatwg.org/#form-associated-element (listed elements + img). */
export function isFormAssociated(el: NodeImpl): boolean {
  return isListed(el) || el.tag === T.img;
}

// --- id lookup ------------------------------------------------------------------------------

/** First element in `el`'s tree (shadow-root aware) whose id is `id`, or null. */
export function elementByIdInTree(el: NodeImpl, id: string): NodeImpl | null {
  if (id === "") return null;
  const root = treeRoot(el);
  // Connected and in the document tree (not a shadow tree): use the document's id index.
  if (root.type === DOCUMENT_NODE) return el.doc._idLookup(id);
  return walkForId(root, id);
}

function walkForId(root: NodeImpl, id: string): NodeImpl | null {
  for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
    if (n.id === id) return n;
  }
  return null;
}

// --- form owner -----------------------------------------------------------------------------

/**
 * The form owner of a form-associated element: https://html.spec.whatwg.org/#form-owner
 * (computed per https://html.spec.whatwg.org/#reset-the-form-owner, steps 3–4).
 */
export function formOwner(el: NodeImpl): NodeImpl | null {
  if (parserAssocCount !== 0) {
    const a = parserAssoc.get(el);
    if (a !== undefined) {
      if (parserAssociationValid(el, a)) return a.form;
      parserAssoc.delete(el);
      parserAssocCount--;
    }
  }
  if (el.tag !== T.img) {
    const formId = attr(el, "form");
    if (formId !== null) {
      // Step 4: a listed element with a form attribute that is connected is associated with
      // the first element in its tree with that id, if it is a form, and nothing otherwise.
      if ((el.flags & F_CONNECTED) !== 0) {
        const target = elementByIdInTree(el, formId);
        return target !== null && target.tag === T.form ? target : null;
      }
    }
  }
  for (let p = el.parent; p !== null; p = p.parent) {
    if (p.tag === T.form) return p;
  }
  return null;
}

// --- parser association ------------------------------------------------------------------
// https://html.spec.whatwg.org/#association-of-controls-and-forms ("parser inserted" with the
// form element pointer). Zero cost unless the parser made an association: `parserAssocCount`
// gates every lookup.

class ParserAssociation {
  form: NodeImpl;
  /** The form's removal generation when associated (`HTMLFormElement._assocGen`). */
  gen: number;
  constructor(form: NodeImpl, gen: number) {
    this.form = form;
    this.gen = gen;
  }
}

const parserAssoc = new WeakMap<NodeImpl, ParserAssociation>();
let parserAssocCount = 0;

function formGeneration(form: NodeImpl): number {
  return (form.node as unknown as { [$assocGen]: number })[$assocGen];
}

/**
 * Called by the parser (`_parserAssociateForm`) for a form-associated element created while
 * the form element pointer was set. Listed elements with a `form` attribute are never passed.
 */
export function parserAssociateForm(el: NodeImpl, form: NodeImpl): void {
  if (form.tag !== T.form) return;
  if (!parserAssoc.has(el)) parserAssocCount++;
  parserAssoc.set(el, new ParserAssociation(form, formGeneration(form)));
  // Disconnection (the element or an ancestor removed) resets the form owner.
  el.flags |= F_CONNECT_HOOK;
  form.flags |= F_CONNECT_HOOK;
}

/** The element's ancestor chain changed (https://html.spec.whatwg.org/#reset-the-form-owner): drop the association. */
export function clearParserAssociation(el: NodeImpl): void {
  if (parserAssocCount !== 0 && parserAssoc.delete(el)) parserAssocCount--;
}

/**
 * Reset-the-form-owner conditions that end the association without a hook on the element:
 * a `form` attribute appeared, the form was removed since (generation changed), or the two are
 * no longer in the same tree.
 */
function parserAssociationValid(el: NodeImpl, a: ParserAssociation): boolean {
  if (isListed(el) && attr(el, "form") !== null) return false;
  if (formGeneration(a.form) !== a.gen) return false;
  return treeRoot(el) === treeRoot(a.form);
}

/** All listed elements (excluding image buttons) whose form owner is `form`, in tree order: form.elements. */
export function formControls(form: NodeImpl, out: NodeImpl[], includeImages: boolean): NodeImpl[] {
  const root = treeRoot(form);
  for (let n = root.type === ELEMENT_NODE ? root : nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
    if (!isListed(n)) continue;
    if (!includeImages && n.tag === T.input && inputType(n) === I_IMAGE) continue;
    if (formOwner(n) === form) out.push(n);
  }
  return out;
}

// --- disabledness -------------------------------------------------------------------------

/** First legend element child of a fieldset. */
export function firstLegend(fieldset: NodeImpl): NodeImpl | null {
  for (let c = fieldset.first; c !== null; c = c.next) if (c.tag === T.legend) return c;
  return null;
}

/**
 * Whether `el` is a descendant of a disabled fieldset and not inside that fieldset's first legend.
 * https://html.spec.whatwg.org/#concept-fe-disabled
 */
export function inDisabledFieldset(el: NodeImpl): boolean {
  let child = el;
  for (let p = el.parent; p !== null; child = p, p = p.parent) {
    if (p.tag === T.fieldset && attr(p, "disabled") !== null) {
      if (child.tag === T.legend && firstLegend(p) === child) continue;
      return true;
    }
  }
  return false;
}

/**
 * https://html.spec.whatwg.org/#concept-fe-disabled (button, input, select, textarea, fieldset),
 * https://html.spec.whatwg.org/#concept-option-disabled, optgroup's disabled attribute.
 * This is what `:disabled` matches.
 */
export function isActuallyDisabled(el: NodeImpl): boolean {
  if ((el.flags & F_FACE) !== 0) return attr(el, "disabled") !== null || inDisabledFieldset(el);
  switch (el.tag) {
    case T.button:
    case T.input:
    case T.select:
    case T.textarea:
    case T.fieldset:
      return attr(el, "disabled") !== null || inDisabledFieldset(el);
    case T.optgroup:
      return attr(el, "disabled") !== null;
    case T.option: {
      if (attr(el, "disabled") !== null) return true;
      const p = el.parent;
      return p !== null && p.tag === T.optgroup && attr(p, "disabled") !== null;
    }
  }
  return false;
}

/** Ancestor <datalist> bars an element from constraint validation and submission. */
export function hasDatalistAncestor(el: NodeImpl): boolean {
  for (let p = el.parent; p !== null; p = p.parent) if (p.tag === T.datalist) return true;
  return false;
}

// --- labels ---------------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#labeled-control */
export function labeledControl(label: NodeImpl): NodeImpl | null {
  const forId = attr(label, "for");
  if (forId !== null) {
    const target = elementByIdInTree(label, forId);
    return target !== null && isLabelable(target) ? target : null;
  }
  for (let n = nextElementInTree(label, label); n !== null; n = nextElementInTree(n, label)) {
    if (isLabelable(n)) return n;
  }
  return null;
}

/** Label elements whose labeled control is `el`, in tree order. https://html.spec.whatwg.org/#dom-lfe-labels */
export function labelsFor(el: NodeImpl, out: NodeImpl[]): NodeImpl[] {
  const root = treeRoot(el);
  for (let n = root.type === ELEMENT_NODE ? root : nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
    if (n.tag === T.label && labeledControl(n) === el) out.push(n);
  }
  return out;
}
