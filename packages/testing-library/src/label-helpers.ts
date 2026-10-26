// Port of @testing-library/dom src/label-helpers.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/label-helpers.ts
//
// Label associations (https://html.spec.whatwg.org/#labeled-control) share aria's
// version-stamped index, dropped on removal so it cannot retain a removed subtree.
// aria-labelledby ids remain container-scoped through LabelContext's lazy id map.

import {
  asciiLowercase,
  ariaAttr,
  attr,
  ELEMENT_NODE,
  HTML_NS,
  nextInTree,
  T,
  TEXT_NODE,
  type NodeImpl,
} from "@ctrl/dom/internal";
import { labelsOf as ariaLabelsOf } from "@ctrl/dom/aria/internal";
import { matchesSelector } from "./selectors.ts";
import { implOf } from "./helpers.ts";

/** https://html.spec.whatwg.org/#category-label (form-associated custom elements not supported). */
export function isLabelable(impl: NodeImpl): boolean {
  if (impl.type !== ELEMENT_NODE || impl.ns !== HTML_NS) return false;
  switch (impl.tag) {
    case T.button:
    case T.meter:
    case T.output:
    case T.progress:
    case T.select:
    case T.textarea:
      return true;
    case T.input: {
      const type = attr(impl, "type");
      return type === null || asciiLowercase(type) !== "hidden";
    }
  }
  return false;
}

/** `labelledNodeNames` upstream: elements whose text is excluded from a label's content. */
function isLabelledNodeName(impl: NodeImpl): boolean {
  if (impl.prefix !== null) return false;
  switch (asciiLowercase(impl.name)) {
    case "button":
    case "meter":
    case "output":
    case "progress":
    case "select":
    case "textarea":
    case "input":
      return true;
  }
  return false;
}

/** First element (tree order) per id in `root`'s subtree, root excluded unless `inclusive`. */
function buildIdMap(root: NodeImpl, inclusive: boolean): Map<string, NodeImpl> {
  const ids = new Map<string, NodeImpl>();
  if (inclusive && root.type === ELEMENT_NODE && root.id !== "") ids.set(root.id, root);
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type === ELEMENT_NODE && n.id !== "" && !ids.has(n.id)) ids.set(n.id, n);
  }
  return ids;
}

/** Per-query container-scoped id lookups; label associations share aria's tree index. */
export class LabelContext {
  container: NodeImpl;
  containerIds: Map<string, NodeImpl> | null;

  constructor(container: NodeImpl) {
    this.container = container;
    this.containerIds = null;
  }

  /** `element.labels` (empty for non-labelable elements) — label elements in tree order. */
  labelsOf(el: NodeImpl): NodeImpl[] {
    return ariaLabelsOf(el) ?? EMPTY;
  }

  /** `container.querySelector('[id="…"]')` */
  byIdInContainer(id: string): NodeImpl | null {
    let ids = this.containerIds;
    if (ids === null) ids = this.containerIds = buildIdMap(this.container, false);
    return ids.get(id) ?? null;
  }
}

const EMPTY: NodeImpl[] = [];

function getTextContent(node: NodeImpl): string {
  if (node.type === ELEMENT_NODE && isLabelledNodeName(node)) return "";
  if (node.type === TEXT_NODE) return node.data;
  let text = "";
  for (let c = node.first; c !== null; c = c.next) text += getTextContent(c);
  return text;
}

export function getLabelContentImpl(element: NodeImpl): string | null {
  if (element.tag === T.label && element.ns === HTML_NS) {
    return getTextContent(element);
  }
  const node = element.node as any;
  return node.value || node.textContent;
}

export interface LabelEntry {
  content: string | null;
  /** null for aria-labelledby entries, undefined when a label wraps no (matching) form control — as upstream. */
  formControl: NodeImpl | null | undefined;
}

const FORM_CONTROL_TAGS = new Set(["button", "input", "meter", "output", "progress", "select", "textarea"]);

/** `label.querySelectorAll('button, input, meter, output, progress, select, textarea')` filtered by `selector`, first hit. */
function labelledFormControl(label: NodeImpl, selector: string): NodeImpl | undefined {
  for (let n = label.first; n !== null; n = nextInTree(n, label)) {
    if (n.type !== ELEMENT_NODE) continue;
    // Type selectors compare the local name (HTML names are already lowercase).
    if (!FORM_CONTROL_TAGS.has(n.name)) continue;
    if (selector === "*" || matchesSelector(n, selector)) return n;
  }
  return undefined;
}

export function getLabelsImpl(ctx: LabelContext, element: NodeImpl, selector = "*"): LabelEntry[] {
  const ariaLabelledBy = ariaAttr(element, "aria-labelledby");
  const labelsId = ariaLabelledBy ? ariaLabelledBy.split(" ") : [];
  if (labelsId.length) {
    return labelsId.map((labelId) => {
      const labellingElement = ctx.byIdInContainer(labelId);
      return labellingElement
        ? { content: getLabelContentImpl(labellingElement), formControl: null }
        : { content: "", formControl: null };
    });
  }
  return ctx.labelsOf(element).map((label) => ({
    content: getLabelContentImpl(label),
    formControl: labelledFormControl(label, selector),
  }));
}

// --- wrapper-level API (same shape as upstream; used by suggestions and tests) ---

export function getRealLabels(element: any): any[] {
  const impl = implOf(element);
  return new LabelContext(impl).labelsOf(impl).map((l) => l.node);
}

export function getLabelContent(element: any): string | null {
  return getLabelContentImpl(implOf(element));
}

export function getLabels(
  container: any,
  element: any,
  { selector = "*" } = {},
): { content: string | null; formControl: any }[] {
  const ctx = new LabelContext(implOf(container));
  return getLabelsImpl(ctx, implOf(element), selector).map((l) => ({
    content: l.content,
    formControl: l.formControl == null ? l.formControl : l.formControl.node,
  }));
}
