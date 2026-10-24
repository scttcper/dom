// https://html.spec.whatwg.org/#the-option-element
// https://html.spec.whatwg.org/#the-optgroup-element
//
// Selectedness is authoritative once set (`_selSet`); before that it derives from the
// `selected` content attribute, which the parser attaches without running attribute hooks.

import { HTMLElement } from "../HTMLElement.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { F_ATTR_HOOK, F_CHILDREN_HOOK, TEXT_NODE, CDATA_SECTION_NODE, SVG_NS, HTML_NS } from "../../nodes/constants.ts";
import { listOfOptions } from "./collections.ts";
import { T } from "../../nodes/tags.ts";
import { nextInTree, nextSkippingChildren } from "../../nodes/traverse.ts";
import { bool, contentAttr, str } from "../reflect.ts";
import { stripAndCollapseWS } from "./common.ts";
import { currentDocument } from "../../window/current.ts";
import type { HTMLSelectElement } from "./HTMLSelectElement.ts";
import { $dirtiness, $impl, $selSet, $selectedness, $settled, $version } from "../../keys.ts";

/**
 * The select element an option belongs to, its "nearest ancestor select":
 * https://html.spec.whatwg.org/#option-element-nearest-ancestor-select
 */
export function optionSelect(option: NodeImpl): NodeImpl | null {
  let ancestorOptgroup = false;
  for (let p = option.parent; p !== null; p = p.parent) {
    if (p.type !== 1 || p.ns !== HTML_NS) continue;
    const tag = p.tag;
    if (tag === T.select) return p;
    if (tag === T.datalist || tag === T.hr || tag === T.option) return null;
    if (tag === T.optgroup) {
      if (ancestorOptgroup) return null;
      ancestorOptgroup = true;
    }
  }
  return null;
}

export class HTMLOptionElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#concept-option-selectedness (authoritative when `_selSet`). */
  [$selectedness]: boolean;
  [$selSet]: boolean;
  /** https://html.spec.whatwg.org/#concept-option-dirtiness */
  [$dirtiness]: boolean;

  /** @internal Use Document.createElement or `new Option()`. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_ATTR_HOOK;
    this[$selectedness] = false;
    this[$selSet] = false;
    this[$dirtiness] = false;
  }

  _selectednessNow(): boolean {
    if (this[$selSet]) return this[$selectedness];
    const select = optionSelect(this[$impl]);
    if (select !== null) {
      const s = select.node as HTMLSelectElement;
      if (!s[$settled]) {
        s._selectednessSettingAlgorithm();
        if (this[$selSet]) return this[$selectedness];
      }
    }
    return contentAttr(this[$impl], "selected") !== null;
  }

  /** Set selectedness without dirtiness or a reset (used by the select's algorithms). */
  _setSelectedness(value: boolean): void {
    if (this[$selSet] && this[$selectedness] === value) return;
    this[$impl].doc[$version]++;
    this[$selectedness] = value;
    this[$selSet] = true;
  }

  /** https://html.spec.whatwg.org/#dom-option-selected */
  get selected(): boolean {
    return this._selectednessNow();
  }

  set selected(value: boolean) {
    this._setSelectedness(!!value);
    this[$dirtiness] = true;
    const select = optionSelect(this[$impl]);
    if (select !== null) {
      const s = select.node as HTMLSelectElement;
      if (value) s._deselectOthers(this[$impl]);
      s._selectednessSettingAlgorithm();
    }
  }

  declare defaultSelected: boolean;
  declare disabled: boolean;

  /** https://html.spec.whatwg.org/#dom-option-text — descendant text, stripped and collapsed, excluding script descendants. */
  get text(): string {
    const root = this[$impl];
    let s = "";
    for (let n = root.first; n !== null; ) {
      if (n.tag === T.script || (n.ns === SVG_NS && n.name === "script")) {
        n = nextSkippingChildren(n, root);
        continue;
      }
      if (n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE) s += n.data;
      n = nextInTree(n, root);
    }
    return stripAndCollapseWS(s);
  }

  set text(value: string) {
    this.textContent = String(value);
  }

  /** https://html.spec.whatwg.org/#dom-option-value */
  get value(): string {
    return contentAttr(this[$impl], "value") ?? this.text;
  }

  set value(value: string) {
    this.setAttribute("value", String(value));
  }

  /** https://html.spec.whatwg.org/#dom-option-label */
  get label(): string {
    const label = contentAttr(this[$impl], "label");
    return label !== null ? label : this.text;
  }

  set label(value: string) {
    this.setAttribute("label", String(value));
  }

  /** https://html.spec.whatwg.org/#dom-option-index */
  get index(): number {
    const select = optionSelect(this[$impl]);
    if (select === null) return 0;
    const i = listOfOptions(select, []).indexOf(this[$impl]);
    return i === -1 ? 0 : i;
  }

  /** https://html.spec.whatwg.org/#dom-option-form */
  get form(): Element | null {
    const select = optionSelect(this[$impl]);
    return select === null ? null : (select.node as HTMLSelectElement).form;
  }

  /** https://html.spec.whatwg.org/#the-option-element:concept-element-attributes-change-ext */
  override _attributeChangedSteps(localName: string, oldValue: string | null, value: string | null, namespace: string | null): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    if (namespace !== null) return;
    if (localName === "disabled") {
      // Enabling the only candidate option of a display-size-1 select must select it
      // (selectedness setting algorithm; WPT select-attribute-change-reset.html).
      if ((oldValue === null) !== (value === null)) resetOwnerSelect(this[$impl]);
      return;
    }
    if (localName !== "selected") return;
    if (this[$dirtiness]) return;
    this._setSelectedness(value !== null);
    const select = optionSelect(this[$impl]);
    if (select !== null) {
      const s = select.node as HTMLSelectElement;
      if (value !== null) s._deselectOthers(this[$impl]);
      s._selectednessSettingAlgorithm();
    }
  }

  /** https://html.spec.whatwg.org/#the-option-element:concept-node-clone-ext */
  override _cloningSteps(copy: Element): void {
    const c = copy as HTMLOptionElement;
    c[$selectedness] = this._selectednessNow();
    c[$selSet] = true;
    c[$dirtiness] = this[$dirtiness];
  }
}

bool(HTMLOptionElement, "defaultSelected=selected disabled");

/**
 * The legacy factory function `Option(text, value, defaultSelected, selected)`:
 * https://html.spec.whatwg.org/#dom-option
 * Exposed as the `Option` global by the window.
 */
export const Option = function Option(this: unknown, text?: string, value?: string, defaultSelected?: boolean, selected?: boolean): HTMLOptionElement {
  if (new.target === undefined) throw new TypeError("Failed to construct 'Option': Please use the 'new' operator, this DOM object constructor cannot be called as a function.");
  const doc = currentDocument();
  const option = doc.createElement("option") as unknown as HTMLOptionElement;
  if (text !== undefined && text !== "") option.appendChild(doc.createTextNode(String(text)));
  if (value !== undefined) option.setAttribute("value", String(value));
  if (defaultSelected) option.setAttribute("selected", "");
  option._setSelectedness(!!selected);
  return option;
} as unknown as new (text?: string, value?: string, defaultSelected?: boolean, selected?: boolean) => HTMLOptionElement;
(Option as unknown as { prototype: object }).prototype = HTMLOptionElement.prototype;

/** Re-run the selectedness setting algorithm of the select `el` (an option or optgroup) belongs to. */
function resetOwnerSelect(el: NodeImpl): void {
  const select = optionSelect(el);
  if (select !== null && (select.node as HTMLSelectElement)[$settled]) (select.node as HTMLSelectElement)._selectednessSettingAlgorithm();
}

/** https://html.spec.whatwg.org/#the-optgroup-element */
export class HTMLOptGroupElement extends HTMLElement {
  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_CHILDREN_HOOK | F_ATTR_HOOK;
  }

  /** An optgroup's disabled state is its options' disabled state: re-run the select's algorithm. */
  override _attributeChangedSteps(localName: string, oldValue: string | null, value: string | null, namespace: string | null): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    if (namespace === null && localName === "disabled" && (oldValue === null) !== (value === null)) resetOwnerSelect(this[$impl]);
  }

  declare disabled: boolean;
  declare label: string;

  /** Options added to / removed from an optgroup change the select's list of options. */
  override _childrenChangedSteps(): void {
    const p = this[$impl].parent;
    if (p !== null && p.tag === T.select) (p.node as HTMLSelectElement)._selectednessSettingAlgorithm();
  }
}

bool(HTMLOptGroupElement, "disabled");
str(HTMLOptGroupElement, "label");
