// Live collections owned by the forms area:
//   HTMLFormControlsCollection  https://html.spec.whatwg.org/#htmlformcontrolscollection
//   RadioNodeList               https://html.spec.whatwg.org/#radionodelist
//   HTMLOptionsCollection       https://html.spec.whatwg.org/#htmloptionscollection
//   the `labels` NodeList        https://html.spec.whatwg.org/#dom-lfe-labels
//
// All are snapshots recomputed when `Document._version` changes (version-stamped caches,
// never invalidated by walking). The HTMLCollection subclasses override `_collect()`; the
// NodeLists use their own snapshot plus prototype index getters.

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import type { Element } from "../../nodes/Element.ts";
import type { Node } from "../../nodes/Node.ts";
import { HTMLCollection, withNamedProperties } from "../../collections/HTMLCollection.ts";
import { ensureIndexGetters, indexGetterTable } from "../../collections/indexed.ts";
import { NodeList } from "../../collections/NodeList.ts";
import { T } from "../../nodes/tags.ts";
import { attr } from "../../nodes/attributes.ts";
import { labelsFor } from "./form-associated.ts";
import { I_RADIO, inputType } from "./input-type.ts";
import { HTML_NS } from "../../nodes/constants.ts";

// --- live NodeLists ----------------------------------------------------------------------------

/**
 * Base for the live NodeLists computed from the tree (labels, RadioNodeList): a version-stamped
 * snapshot plus Proxy-free prototype index getters (collections/indexed.ts).
 */
abstract class ComputedNodeList extends NodeList {
  declare _cache: { items: Node[]; version: number; doc: object | null };

  constructor() {
    super(null);
    Object.defineProperty(this, "_cache", { value: { items: [], version: -1, doc: null } });
  }

  abstract _compute(): Node[];
  abstract _doc(): { _version: number };

  _snapshot(): Node[] {
    const c = this._cache;
    const doc = this._doc();
    if (c.version === doc._version && c.doc === doc) return c.items;
    const items = this._compute();
    c.items = items;
    c.version = doc._version;
    c.doc = doc;
    if (items.length > nodeListIndex.count) ensureIndexGetters(nodeListIndex, items.length);
    return items;
  }

  override get length(): number {
    return this._snapshot().length;
  }

  override item(index: number): Node | null {
    const items = this._snapshot();
    const i = index >>> 0;
    return i < items.length ? items[i] : null;
  }
}

const nodeListIndex = indexGetterTable(ComputedNodeList.prototype, (self, i) => {
  const items = (self as ComputedNodeList)._snapshot();
  return i < items.length ? items[i] : undefined;
});

/** Live NodeList of the label elements associated with a labelable element. */
export class LabelsNodeList extends ComputedNodeList {
  declare _el: NodeImpl;

  /** @internal */
  constructor(el: NodeImpl) {
    super();
    Object.defineProperty(this, "_el", { value: el });
  }

  _doc(): { _version: number } {
    return this._el.doc;
  }

  _compute(): Node[] {
    const impls = labelsFor(this._el, []);
    const items: Node[] = new Array(impls.length);
    for (let i = 0; i < impls.length; i++) items[i] = impls[i].node;
    return items;
  }
}

// --- RadioNodeList --------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#radionodelist — live list of a form's controls with a given name/id. */
export class RadioNodeList extends ComputedNodeList {
  declare _form: NodeImpl;
  declare _name: string;

  /** @internal */
  constructor(form: NodeImpl, name: string) {
    super();
    Object.defineProperty(this, "_form", { value: form });
    Object.defineProperty(this, "_name", { value: name });
  }

  _doc(): { _version: number } {
    return this._form.doc;
  }

  _compute(): Node[] {
    const controls = (this._form.node as unknown as { _controls(): NodeImpl[] })._controls();
    const items: Node[] = [];
    const name = this._name;
    for (let i = 0; i < controls.length; i++) {
      const c = controls[i];
      if (c.id === name || attr(c, "name") === name) items.push(c.node);
    }
    return items;
  }

  /** https://html.spec.whatwg.org/#dom-radionodelist-value */
  get value(): string {
    const items = this._snapshot();
    for (let i = 0; i < items.length; i++) {
      const impl = (items[i] as Element)._impl;
      if (impl.tag === T.input && inputType(impl) === I_RADIO && (items[i] as unknown as { checked: boolean }).checked) {
        return attr(impl, "value") ?? "on";
      }
    }
    return "";
  }

  set value(value: string) {
    const v = String(value);
    const items = this._snapshot();
    for (let i = 0; i < items.length; i++) {
      const impl = (items[i] as Element)._impl;
      if (impl.tag === T.input && inputType(impl) === I_RADIO && (attr(impl, "value") ?? "on") === v) {
        (items[i] as unknown as { checked: boolean }).checked = true;
        return;
      }
    }
  }
}
Object.defineProperty(RadioNodeList.prototype, Symbol.toStringTag, { value: "RadioNodeList", configurable: true });

// --- HTMLFormControlsCollection -------------------------------------------------------------

/** https://html.spec.whatwg.org/#htmlformcontrolscollection */
export class HTMLFormControlsCollection extends HTMLCollection {
  /** @internal Use `createFormControlsCollection(form)` (adds named property access). */
  constructor(form: NodeImpl) {
    super(form, false, null);
  }

  override _collect(out: Element[]): void {
    const controls = (this._s.root.node as unknown as { _controls(): NodeImpl[] })._controls();
    for (let i = 0; i < controls.length; i++) out.push(controls[i].node as Element);
  }

  /** https://html.spec.whatwg.org/#dom-htmlformcontrolscollection-nameditem */
  override namedItem(name: string): Element | null {
    const n = String(name);
    if (n === "") return null;
    const items = this._snapshot();
    let first: Element | null = null;
    let count = 0;
    for (let i = 0; i < items.length; i++) {
      const impl = items[i]._impl;
      if (impl.id === n || attr(impl, "name") === n) {
        if (count === 0) first = items[i];
        count++;
        if (count > 1) break;
      }
    }
    if (count <= 1) return first;
    return new RadioNodeList(this._s.root, n) as unknown as Element;
  }
}
Object.defineProperty(HTMLFormControlsCollection.prototype, Symbol.toStringTag, { value: "HTMLFormControlsCollection", configurable: true });

/** form.elements: the collection with WebIDL named properties (`form.elements.username`). */
export function createFormControlsCollection(form: NodeImpl): HTMLFormControlsCollection {
  return withNamedProperties(new HTMLFormControlsCollection(form));
}

// --- HTMLOptionsCollection ------------------------------------------------------------------

/** The list of options of a select: https://html.spec.whatwg.org/#concept-select-option-list */
export function listOfOptions(select: NodeImpl, out: NodeImpl[]): NodeImpl[] {
  for (let c = select.first; c !== null; c = c.next) {
    if (c.ns !== HTML_NS) continue;
    if (c.tag === T.option) out.push(c);
    else if (c.tag === T.optgroup) {
      for (let o = c.first; o !== null; o = o.next) if (o.tag === T.option) out.push(o);
    }
  }
  return out;
}

/** https://html.spec.whatwg.org/#htmloptionscollection */
export class HTMLOptionsCollection extends HTMLCollection {
  /** @internal */
  constructor(select: NodeImpl) {
    super(select, false, null);
  }

  override _collect(out: Element[]): void {
    const select = this._s.root;
    for (let c = select.first; c !== null; c = c.next) {
      if (c.tag === T.option) out.push(c.node as Element);
      else if (c.tag === T.optgroup) {
        for (let o = c.first; o !== null; o = o.next) if (o.tag === T.option) out.push(o.node as Element);
      }
    }
    ensureOptionIndexAccessors(out.length + 1);
  }

  /** https://html.spec.whatwg.org/#dom-htmloptionscollection-setter */
  _setIndex(index: number, value: Element | null): void {
    const select = this._s.root.node as Element;
    const items = this._snapshot();
    if (value === null || value === undefined) {
      if (index < items.length) items[index].remove();
      return;
    }
    if (typeof value !== "object" || !("_impl" in value) || value._impl.tag !== T.option) {
      throw new TypeError("Failed to set an indexed property on 'HTMLOptionsCollection': parameter 2 is not of type 'HTMLOptionElement'.");
    }
    const length = items.length;
    const n = index - length;
    if (n > 0) {
      const doc = this._s.root.doc;
      const frag = doc.createDocumentFragment();
      for (let i = 0; i < n; i++) frag.appendChild(doc.createElement("option"));
      select.appendChild(frag);
    }
    if (n >= 0) select.appendChild(value);
    else {
      const old = items[index];
      (old.parentNode as Element).replaceChild(value, old);
    }
  }

  override get length(): number {
    return this._snapshot().length;
  }

  /** https://html.spec.whatwg.org/#dom-htmloptionscollection-length */
  override set length(value: number) {
    const n = Number(value) >>> 0;
    const select = this._s.root.node as Element;
    const items = this._snapshot();
    const current = items.length;
    if (n > current) {
      if (n - current > 100000) return; // UAs may limit; browsers cap at 100000 new options.
      const doc = this._s.root.doc;
      const frag = doc.createDocumentFragment();
      for (let i = current; i < n; i++) frag.appendChild(doc.createElement("option"));
      select.appendChild(frag);
    } else if (n < current) {
      const remove = items.slice(n);
      for (let i = 0; i < remove.length; i++) remove[i].remove();
    }
  }

  /** https://html.spec.whatwg.org/#dom-htmloptionscollection-add */
  add(element: Element, before: Element | number | null = null): void {
    const parent = this._s.root.node as Element;
    if (element === null || typeof element !== "object" || !("_impl" in element)) {
      throw new TypeError("Failed to execute 'add' on 'HTMLOptionsCollection': parameter 1 is not of type 'HTMLOptionElement or HTMLOptGroupElement'.");
    }
    const tag = element._impl.tag;
    if (tag !== T.option && tag !== T.optgroup) {
      throw new TypeError("Failed to execute 'add' on 'HTMLOptionsCollection': parameter 1 is not of type 'HTMLOptionElement or HTMLOptGroupElement'.");
    }
    // Step 1: element is an ancestor of the select → HierarchyRequestError.
    for (let p: NodeImpl | null = this._s.root; p !== null; p = p.parent) {
      if (p === element._impl) throw new DOMException("The new element is an ancestor of the select element.", "HierarchyRequestError");
    }
    let reference: Element | null = null;
    if (typeof before === "number") reference = this._snapshot()[before] ?? null;
    else if (before !== null && before !== undefined) {
      reference = before;
      // Step 2: before is an element that is not a descendant of the select → NotFoundError.
      let inside = false;
      for (let p = before._impl.parent; p !== null; p = p.parent) {
        if (p === this._s.root) {
          inside = true;
          break;
        }
      }
      if (!inside) throw new DOMException("The node before which the new node is to be inserted is not in this select.", "NotFoundError");
    }
    if (element === reference) return;
    const insertParent = reference === null ? parent : (reference.parentNode as Element);
    insertParent.insertBefore(element, reference);
  }

  /** https://html.spec.whatwg.org/#dom-htmloptionscollection-remove */
  remove(index: number): void {
    const items = this._snapshot();
    const i = Number(index) | 0;
    if (items.length === 0 || i < 0 || i >= items.length) return;
    items[i].remove();
  }

  /** https://html.spec.whatwg.org/#dom-htmloptionscollection-selectedindex */
  get selectedIndex(): number {
    return (this._s.root.node as unknown as { selectedIndex: number }).selectedIndex;
  }

  set selectedIndex(value: number) {
    (this._s.root.node as unknown as { selectedIndex: number }).selectedIndex = value;
  }
}

// Indexed getters + setters (options[i] = option) on HTMLOptionsCollection.prototype and
// HTMLSelectElement.prototype (select[i]); Proxy-free like collections/indexed.ts, grown on demand.
let optionIndexCount = 0;
const indexHosts: { proto: object; coll: (self: object) => HTMLOptionsCollection }[] = [
  { proto: HTMLOptionsCollection.prototype, coll: (self) => self as HTMLOptionsCollection },
];

/** @internal Register a prototype whose instances forward indices to an options collection. */
export function addOptionIndexHost(proto: object, coll: (self: object) => HTMLOptionsCollection): void {
  indexHosts.push({ proto, coll });
  defineOptionIndices(indexHosts[indexHosts.length - 1], 0, optionIndexCount);
}

function defineOptionIndices(host: (typeof indexHosts)[number], from: number, to: number): void {
  const coll = host.coll;
  for (let i = from; i < to; i++) {
    Object.defineProperty(host.proto, i, {
      get() {
        return coll(this).item(i) ?? undefined;
      },
      set(value: Element | null) {
        coll(this)._setIndex(i, value);
      },
      enumerable: false,
      configurable: true,
    });
  }
}

export function ensureOptionIndexAccessors(n: number): void {
  if (n <= optionIndexCount) return;
  const target = Math.max(n, optionIndexCount * 2, 32);
  for (const host of indexHosts) defineOptionIndices(host, optionIndexCount, target);
  optionIndexCount = target;
}
ensureOptionIndexAccessors(32);
