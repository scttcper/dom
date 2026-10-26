// Form-control state reads (input type, value, checkedness, selectedness, labels).
//
// Specs:
//   https://html.spec.whatwg.org/multipage/input.html#attr-input-type
//   https://html.spec.whatwg.org/multipage/form-elements.html#concept-select-option-list
//   https://html.spec.whatwg.org/multipage/form-elements.html#concept-option-selectedness
//   https://html.spec.whatwg.org/multipage/forms.html#category-label
//   https://html.spec.whatwg.org/multipage/forms.html#labeled-control
//
// TODO(aria): switch the state reads to html-forms' NodeImpl-level exports
// (`inputType`, value/checkedness/selectedness from `src/html/forms/state.ts`,
// `listOfOptions`, `isLabelable`) once they are re-exported from `@ctrl/dom/internal`.
// Until then dynamic state (value, checkedness, indeterminate, selectedness) is read
// from the wrapper's IDL attributes when the element class implements them, falling back
// to the content attributes (the initial state) otherwise.

import {
  ELEMENT_NODE,
  DOCUMENT_NODE,
  HTML_NS,
  T,
  attr,
  treeRoot,
  type NodeImpl,
  derivedCache,
} from "@ctrl/dom/internal";
import { $impl, $version } from "@ctrl/dom/internal";

/** Canonical `type` IDL value of an HTML input: https://html.spec.whatwg.org/multipage/input.html#attr-input-type */
// oxfmt-ignore
const INPUT_TYPES = new Set([
  "hidden", "text", "search", "tel", "url", "email", "password", "date", "month", "week", "time",
  "datetime-local", "number", "range", "color", "checkbox", "radio", "file", "submit", "image",
  "reset", "button",
]);

export function inputType(impl: NodeImpl): string {
  const t = attr(impl, "type");
  if (t === null) return "text";
  if (INPUT_TYPES.has(t)) return t;
  const lower = t.toLowerCase();
  return INPUT_TYPES.has(lower) ? lower : "text";
}

/** Whether `impl` is an HTML-namespace element with the given tag. */
export function isHTML(impl: NodeImpl, tag: number): boolean {
  return impl.tag === tag && impl.ns === HTML_NS;
}

interface StateWrapper {
  value?: unknown;
  checked?: unknown;
  indeterminate?: unknown;
  selected?: unknown;
  selectedOptions?: ArrayLike<{ [$impl]: NodeImpl }>;
}

/** Child text content (https://dom.spec.whatwg.org/#concept-child-text-content). */
function childTextContent(impl: NodeImpl): string {
  let s = "";
  for (let c = impl.first; c !== null; c = c.next) if (c.type === 3 || c.type === 4) s += c.data;
  return s;
}

/** `input.value` / `textarea.value`. */
export function controlValue(impl: NodeImpl): string {
  const v = (impl.node as unknown as StateWrapper).value;
  if (typeof v === "string") return v;
  if (impl.tag === T.textarea) return childTextContent(impl);
  return attr(impl, "value") ?? "";
}

/** `input.checked` (checkedness). */
export function checkedness(impl: NodeImpl): boolean {
  const v = (impl.node as unknown as StateWrapper).checked;
  if (typeof v === "boolean") return v;
  return attr(impl, "checked") !== null;
}

/** `input.indeterminate` (IDL-only flag, never reflected). */
export function indeterminate(impl: NodeImpl): boolean {
  return (impl.node as unknown as StateWrapper).indeterminate === true;
}

/** The select's list of options: https://html.spec.whatwg.org/multipage/form-elements.html#concept-select-option-list */
export function listOfOptions(select: NodeImpl, out: NodeImpl[]): NodeImpl[] {
  for (let c = select.first; c !== null; c = c.next) {
    if (c.ns !== HTML_NS) continue;
    if (c.tag === T.option) out.push(c);
    else if (c.tag === T.optgroup) {
      for (let o = c.first; o !== null; o = o.next) if (o.tag === T.option && o.ns === HTML_NS) out.push(o);
    }
  }
  return out;
}

/** Display size: https://html.spec.whatwg.org/multipage/form-elements.html#concept-select-size */
export function selectSize(impl: NodeImpl): number {
  const s = attr(impl, "size");
  if (s === null) return 0;
  const m = /^[\t\n\f\r ]*\+?(\d+)/.exec(s);
  if (m === null) return 0;
  const n = Number(m[1]);
  return n > 2147483647 ? 0 : n;
}

/** Selectedness of each option per the HTML "selectedness setting algorithm" applied to the initial (attribute) state. */
function fallbackSelected(select: NodeImpl | null, option: NodeImpl): boolean {
  if (select === null) return attr(option, "selected") !== null;
  const options = listOfOptions(select, []);
  if (attr(select, "multiple") !== null) return attr(option, "selected") !== null;
  // Single select: the last option with `selected` wins; with none and display size 1, the
  // first non-disabled option is selected.
  let chosen: NodeImpl | null = null;
  for (const o of options) if (attr(o, "selected") !== null) chosen = o;
  if (chosen === null && selectSize(select) <= 1) {
    for (const o of options) {
      if (attr(o, "disabled") !== null) continue;
      if (o.parent !== null && o.parent.tag === T.optgroup && attr(o.parent, "disabled") !== null) continue;
      chosen = o;
      break;
    }
  }
  return chosen === option;
}

function owningSelect(option: NodeImpl): NodeImpl | null {
  const p = option.parent;
  if (p === null) return null;
  if (p.tag === T.select && p.ns === HTML_NS) return p;
  if (p.tag === T.optgroup && p.parent !== null && p.parent.tag === T.select && p.parent.ns === HTML_NS)
    return p.parent;
  return null;
}

/** `option.selected` (selectedness). */
export function optionSelected(option: NodeImpl): boolean {
  const v = (option.node as unknown as StateWrapper).selected;
  if (typeof v === "boolean") return v;
  return fallbackSelected(owningSelect(option), option);
}

/** `select.selectedOptions`, in tree order. */
export function selectedOptions(select: NodeImpl): NodeImpl[] {
  const so = (select.node as unknown as StateWrapper).selectedOptions;
  if (so !== undefined && so !== null && typeof so.length === "number") {
    const out: NodeImpl[] = [];
    for (let i = 0; i < so.length; i++) out.push(so[i][$impl]);
    return out;
  }
  const out: NodeImpl[] = [];
  for (const o of listOfOptions(select, [])) if (optionSelected(o)) out.push(o);
  return out;
}

// --- labels -------------------------------------------------------------------------------

/** https://html.spec.whatwg.org/multipage/forms.html#category-label (as jsdom implements it). */
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
    case T.input:
      return inputType(impl) !== "hidden";
  }
  // TODO(aria): form-associated custom elements are labelable too.
  return false;
}

class LabelIndex {
  version: number;
  map: Map<NodeImpl, NodeImpl[]>;
  constructor(version: number) {
    this.version = version;
    this.map = new Map();
  }
}

/**
 * Label associations per tree root, rebuilt when the document version changes (jsdom memoizes
 * the same way). Held in the document's derived caches (dropped on node removal) so a stale index
 * never keeps a removed tree alive.
 */
const LABEL_INDEXES = {};
const newLabelIndexes = (): WeakMap<NodeImpl, LabelIndex> => new WeakMap();
const EMPTY: NodeImpl[] = [];

function buildLabelIndex(root: NodeImpl, version: number): LabelIndex {
  const index = new LabelIndex(version);
  const labels: NodeImpl[] = [];
  let ids: Map<string, NodeImpl> | null = null;
  const useDocIds = root.type === DOCUMENT_NODE;
  let anyFor = false;
  // One preorder walk over the root's inclusive descendants.
  for (let n: NodeImpl | null = root; n !== null;) {
    if (n.type === ELEMENT_NODE) {
      if (n.tag === T.label && n.ns === HTML_NS) {
        labels.push(n);
        if (attr(n, "for") !== null) anyFor = true;
      }
    }
    // next in tree order within root
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
  if (labels.length === 0) return index;
  if (anyFor && !useDocIds) {
    ids = new Map();
    for (let n: NodeImpl | null = root; n !== null;) {
      if (n.type === ELEMENT_NODE && n.id !== "" && !ids.has(n.id)) ids.set(n.id, n);
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
  for (const label of labels) {
    const control = labeledControl(label, useDocIds ? root : null, ids);
    if (control === null) continue;
    const list = index.map.get(control);
    if (list === undefined) index.map.set(control, [label]);
    else list.push(label);
  }
  return index;
}

/** https://html.spec.whatwg.org/multipage/forms.html#labeled-control */
function labeledControl(label: NodeImpl, docRoot: NodeImpl | null, ids: Map<string, NodeImpl> | null): NodeImpl | null {
  const forValue = attr(label, "for");
  if (forValue !== null) {
    if (forValue === "") return null;
    let target: NodeImpl | null;
    if (docRoot !== null) {
      const el = (docRoot.node as unknown as { _idLookup(id: string): NodeImpl | null })._idLookup(forValue);
      target = el;
    } else {
      target = ids?.get(forValue) ?? null;
    }
    return target !== null && isLabelable(target) ? target : null;
  }
  for (let n = label.first; n !== null;) {
    if (n.type === ELEMENT_NODE && isLabelable(n)) return n;
    if (n.first !== null) n = n.first;
    else {
      let cur: NodeImpl | null = n;
      n = null;
      while (cur !== null && cur !== label) {
        if (cur.next !== null) {
          n = cur.next;
          break;
        }
        cur = cur.parent;
      }
    }
  }
  return null;
}

/**
 * `element.labels` as jsdom computes it: null for non-labelable elements, otherwise the
 * label elements (tree order, same tree) whose labeled control is the element.
 */
export function labelsOf(impl: NodeImpl): NodeImpl[] | null {
  if (!isLabelable(impl)) return null;
  return labelMapForTree(impl).get(impl) ?? EMPTY;
}

/**
 * The label associations of `impl`'s tree (labelable control → its labels in tree order), current
 * for the document version: `labelsOf` for many elements of one tree resolves it once.
 */
export function labelMapForTree(impl: NodeImpl): Map<NodeImpl, NodeImpl[]> {
  const root = treeRoot(impl);
  const version = impl.doc[$version];
  const labelIndexes = derivedCache(impl.doc, LABEL_INDEXES, newLabelIndexes);
  let index = labelIndexes.get(root);
  if (index === undefined || index.version !== version) {
    index = buildLabelIndex(root, version);
    labelIndexes.set(root, index);
  }
  return index.map;
}
