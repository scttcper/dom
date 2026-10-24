// https://html.spec.whatwg.org/#the-select-element
//
// The selectedness setting algorithm runs eagerly from the hooks that change the list of
// options (select/optgroup children changed, option `selected` attribute, option.selected),
// like the spec. The parser calls `_childrenChangedSteps()` after building a select's
// children, so parsed selects are settled too.

import { HTMLElement } from "../HTMLElement.ts";
import { installAutocomplete } from "./autofill.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { F_ATTR_HOOK, F_CHILDREN_HOOK, F_CONNECT_HOOK } from "../../nodes/constants.ts";
import { T } from "../../nodes/tags.ts";
import { nextInTree, nextSkippingChildren } from "../../nodes/traverse.ts";
import { HTMLCollection } from "../../collections/HTMLCollection.ts";
import { bool, contentAttr, parseNonNegativeInteger, str, ulong } from "../reflect.ts";
import { formOwner, hasDatalistAncestor, isActuallyDisabled } from "./form-associated.ts";
import { addOptionIndexHost, HTMLOptionsCollection, LabelsNodeList, listOfOptions } from "./collections.ts";
import {
  installConstraintValidation,
  MSG_SELECT,
  V_CUSTOM_ERROR,
  V_VALUE_MISSING,
  type ConstraintValidation,
  type ValidityState,
} from "./validation.ts";
import type { HTMLOptionElement } from "./HTMLOptionElement.ts";
import { $customValidity, $dirtiness, $impl, $labels, $options, $selectedOptions, $settled, $updatingSelectedContent, $userValidity, $validity } from "../../keys.ts";
import { noteChangeDispatch } from "./user-validity.ts";
import type { Event } from "../../events/Event.ts";
import type { EventTarget } from "../../events/EventTarget.ts";

function opt(o: NodeImpl): HTMLOptionElement {
  return o.node as HTMLOptionElement;
}

/** select.selectedOptions: https://html.spec.whatwg.org/#dom-select-selectedoptions */
class SelectedOptionsCollection extends HTMLCollection {
  override _collect(out: Element[]): void {
    const options = listOfOptions(this._s.root, []);
    for (let i = 0; i < options.length; i++) if (opt(options[i])._selectednessNow()) out.push(options[i].node as Element);
  }
}

// selectedOptions is a plain HTMLCollection as far as script can tell (WPT select-selectedOptions.html).
Object.defineProperty(SelectedOptionsCollection.prototype, "constructor", { value: HTMLCollection, writable: true, configurable: true });

export class HTMLSelectElement extends HTMLElement {
  [$customValidity]: string;
  [$validity]: ValidityState | null;
  [$labels]: LabelsNodeList | null;
  [$options]: HTMLOptionsCollection | null;
  [$selectedOptions]: HTMLCollection | null;
  /**
   * The selectedness setting algorithm has run at least once. Trees built by the parser or by
   * cloning attach options without hooks; the first read (or insertion) settles them.
   */
  [$settled]: boolean;
  /** Re-entrancy guard for `_updateSelectedContent` (it mutates the select's subtree). */
  [$updatingSelectedContent]: boolean;
  /** https://html.spec.whatwg.org/#user-validity (forms/user-validity.ts). */
  [$userValidity]: boolean;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_CHILDREN_HOOK | F_ATTR_HOOK | F_CONNECT_HOOK;
    this[$customValidity] = "";
    this[$validity] = null;
    this[$labels] = null;
    this[$options] = null;
    this[$selectedOptions] = null;
    this[$settled] = false;
    this[$updatingSelectedContent] = false;
    this[$userValidity] = false;
  }

  /** Sets user validity when a `change` event is dispatched at this control (forms/user-validity.ts). */
  override _getTheParent(event: Event): EventTarget | null {
    noteChangeDispatch(this, event);
    return super._getTheParent(event);
  }

  _ensureSettled(): void {
    if (!this[$settled]) this._selectednessSettingAlgorithm();
  }

  override _cloningSteps(copy: Element): void {
    (copy as HTMLSelectElement)[$settled] = this[$settled];
  }

  override _connectedSteps(): void {
    super._connectedSteps();
    this._ensureSettled();
  }

  /** https://html.spec.whatwg.org/#dom-select-type */
  get type(): string {
    return contentAttr(this[$impl], "multiple") !== null ? "select-multiple" : "select-one";
  }

  /** https://html.spec.whatwg.org/#concept-select-size */
  _displaySize(): number {
    const v = contentAttr(this[$impl], "size");
    if (v !== null) {
      // Parsing success wins, even for 0 (browsers treat 0 like 1; the spec does not).
      const n = parseNonNegativeInteger(v);
      if (!Number.isNaN(n)) return n;
    }
    return contentAttr(this[$impl], "multiple") !== null ? 4 : 1;
  }

  _isSingle(): boolean {
    return contentAttr(this[$impl], "multiple") === null;
  }

  /** https://html.spec.whatwg.org/#dom-select-options */
  get options(): HTMLOptionsCollection {
    return (this[$options] ??= new HTMLOptionsCollection(this[$impl]));
  }

  get length(): number {
    return listOfOptions(this[$impl], []).length;
  }

  set length(value: number) {
    this.options.length = value;
  }

  /** https://html.spec.whatwg.org/#dom-select-item */
  item(index: number): Element | null {
    return this.options.item(index);
  }

  /** https://html.spec.whatwg.org/#dom-select-nameditem */
  namedItem(name: string): Element | null {
    return this.options.namedItem(name);
  }

  /** https://html.spec.whatwg.org/#dom-select-add */
  add(element: Element, before: Element | number | null = null): void {
    this.options.add(element, before);
  }

  /** https://html.spec.whatwg.org/#dom-select-remove — remove() removes the select; remove(index) an option. */
  override remove(index?: number): void {
    if (arguments.length === 0) {
      super.remove();
      return;
    }
    this.options.remove(index!);
  }

  /** https://html.spec.whatwg.org/#dom-select-selectedoptions */
  get selectedOptions(): HTMLCollection {
    return (this[$selectedOptions] ??= new SelectedOptionsCollection(this[$impl], false, null));
  }

  /** https://html.spec.whatwg.org/#dom-select-selectedindex */
  get selectedIndex(): number {
    const options = listOfOptions(this[$impl], []);
    for (let i = 0; i < options.length; i++) if (opt(options[i])._selectednessNow()) return i;
    return -1;
  }

  set selectedIndex(value: number) {
    const index = Number(value) | 0;
    const options = listOfOptions(this[$impl], []);
    for (let i = 0; i < options.length; i++) opt(options[i])._setSelectedness(false);
    if (index >= 0 && index < options.length) {
      const o = opt(options[index]);
      o._setSelectedness(true);
      o[$dirtiness] = true;
    }
    this._updateSelectedContent();
  }

  /** https://html.spec.whatwg.org/#dom-select-value */
  get value(): string {
    const options = listOfOptions(this[$impl], []);
    for (let i = 0; i < options.length; i++) {
      const o = opt(options[i]);
      if (o._selectednessNow()) return o.value;
    }
    return "";
  }

  set value(v: string) {
    const value = String(v);
    const options = listOfOptions(this[$impl], []);
    let found = false;
    for (let i = 0; i < options.length; i++) {
      const o = opt(options[i]);
      if (!found && o.value === value) {
        o._setSelectedness(true);
        o[$dirtiness] = true;
        found = true;
      } else {
        o._setSelectedness(false);
      }
    }
    this._updateSelectedContent();
  }

  get form(): Element | null {
    const owner = formOwner(this[$impl]);
    return owner === null ? null : (owner.node as Element);
  }

  get labels(): LabelsNodeList {
    return (this[$labels] ??= new LabelsNodeList(this[$impl]));
  }

  declare autocomplete: string;
  declare disabled: boolean;
  declare multiple: boolean;
  declare name: string;
  declare required: boolean;
  declare size: number;

  /** https://html.spec.whatwg.org/#dom-select-showpicker — no picker UI. */
  showPicker(): void {
    if (isActuallyDisabled(this[$impl])) {
      throw new DOMException("Failed to execute 'showPicker' on 'HTMLSelectElement': HTMLSelectElement::showPicker() cannot be used on immutable controls.", "InvalidStateError");
    }
  }

  // --- selectedness ---------------------------------------------------------------------------

  /**
   * "If the multiple attribute is absent, whenever an option element in the select element's
   * list of options has its selectedness set to true, the user agent must set the selectedness
   * of all the other option elements in its list of options to false."
   */
  _deselectOthers(selected: NodeImpl): void {
    if (!this._isSingle()) return;
    const options = listOfOptions(this[$impl], []);
    for (let i = 0; i < options.length; i++) if (options[i] !== selected) opt(options[i])._setSelectedness(false);
  }

  /** https://html.spec.whatwg.org/#selectedness-setting-algorithm */
  _selectednessSettingAlgorithm(): void {
    this[$settled] = true;
    this._runSelectedness();
    this._updateSelectedContent();
  }

  _runSelectedness(): void {
    if (!this._isSingle() || this._displaySize() !== 1) return;
    const options = listOfOptions(this[$impl], []);
    let selectedCount = 0;
    for (let i = 0; i < options.length; i++) if (opt(options[i])._selectednessNow()) selectedCount++;
    if (selectedCount === 0) {
      // Select the first non-disabled option in tree order, if any.
      for (let i = 0; i < options.length; i++) {
        if (!isActuallyDisabled(options[i])) {
          opt(options[i])._setSelectedness(true);
          return;
        }
      }
      return;
    }
    if (selectedCount > 1) {
      // Keep only the last selected option.
      let last = -1;
      for (let i = 0; i < options.length; i++) if (opt(options[i])._selectednessNow()) last = i;
      for (let i = 0; i < options.length; i++) if (i !== last) opt(options[i])._setSelectedness(false);
    }
  }

  // --- <selectedcontent> ---------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#get-a-select's-enabled-selectedcontent */
  _enabledSelectedContent(): NodeImpl | null {
    const impl = this[$impl];
    if (contentAttr(impl, "multiple") !== null) return null;
    for (let n = impl.first; n !== null; ) {
      // Option contents are skipped: keeps the walk O(children) for large option lists.
      if (n.type !== 1 || n.tag === T.option || n.tag !== T.selectedcontent) {
        n = n.tag === T.option ? nextSkippingChildren(n, impl) : nextInTree(n, impl);
        continue;
      }
      // Disabled when nested in another select inside this one.
      for (let p = n.parent; p !== null && p !== impl; p = p.parent) if (p.tag === T.select) return null;
      return n;
    }
    return null;
  }

  /**
   * https://html.spec.whatwg.org/#update-a-select's-selectedcontent — mirror the first selected
   * option's children into the select's selectedcontent element.
   */
  _updateSelectedContent(): void {
    if (this[$updatingSelectedContent]) return;
    const sc = this._enabledSelectedContent();
    if (sc === null) return;
    this[$updatingSelectedContent] = true;
    try {
      const options = listOfOptions(this[$impl], []);
      let selected: NodeImpl | null = null;
      for (let i = 0; i < options.length; i++) {
        if (opt(options[i])._selectednessNow()) {
          selected = options[i];
          break;
        }
      }
      const target = sc.node as Element;
      if (selected === null) {
        target.replaceChildren();
        return;
      }
      // https://html.spec.whatwg.org/#clone-an-option-into-a-selectedcontent
      const doc = this[$impl].doc;
      const fragment = doc.createDocumentFragment();
      for (let c = selected.first; c !== null; c = c.next) fragment.appendChild(c.node.cloneNode(true));
      target.replaceChildren(fragment);
    } finally {
      this[$updatingSelectedContent] = false;
    }
  }

  /** https://html.spec.whatwg.org/#the-select-element:concept-form-reset-control */
  _reset(): void {
    this[$userValidity] = false;
    this[$settled] = true;
    const options = listOfOptions(this[$impl], []);
    for (let i = 0; i < options.length; i++) {
      const o = opt(options[i]);
      o[$dirtiness] = false;
      o._setSelectedness(contentAttr(options[i], "selected") !== null);
    }
    this._selectednessSettingAlgorithm();
  }

  /** The list of options changed: https://html.spec.whatwg.org/#the-select-element:selectedness-setting-algorithm */
  override _childrenChangedSteps(): void {
    this._selectednessSettingAlgorithm();
  }

  override _attributeChangedSteps(localName: string, oldValue: string | null, value: string | null, namespace: string | null): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    // Browsers re-run the algorithm when the display mode changes (multiple / size).
    if (namespace === null && (localName === "multiple" || localName === "size")) {
      // Leaving multiple mode keeps the LAST selected option (selectedness setting algorithm,
      // as jsdom; WPT select-attribute-change-reset.html expects Chromium's first).
      this._selectednessSettingAlgorithm();
    }
  }

  // --- constraint validation -------------------------------------------------------------------

  _barredFromValidation(): boolean {
    return isActuallyDisabled(this[$impl]) || hasDatalistAncestor(this[$impl]);
  }

  /** https://html.spec.whatwg.org/#placeholder-label-option */
  _placeholderLabelOption(): NodeImpl | null {
    const impl = this[$impl];
    if (contentAttr(impl, "required") === null || !this._isSingle() || this._displaySize() !== 1) return null;
    const options = listOfOptions(impl, []);
    if (options.length === 0) return null;
    const first = options[0];
    if (first.parent !== impl) return null;
    return opt(first).value === "" ? first : null;
  }

  _validityFlags(): number {
    let flags = this[$customValidity] === "" ? 0 : V_CUSTOM_ERROR;
    if (contentAttr(this[$impl], "required") !== null) {
      const options = listOfOptions(this[$impl], []);
      let selected: NodeImpl | null = null;
      let count = 0;
      for (let i = 0; i < options.length; i++) {
        if (opt(options[i])._selectednessNow()) {
          if (count === 0) selected = options[i];
          count++;
        }
      }
      if (count === 0 || (count === 1 && selected === this._placeholderLabelOption())) flags |= V_VALUE_MISSING;
    }
    return flags;
  }

  _validationMessage(flags: number): string {
    if ((flags & V_VALUE_MISSING) !== 0) return MSG_SELECT;
    return this[$customValidity];
  }
}

export interface HTMLSelectElement extends ConstraintValidation {}
installConstraintValidation(HTMLSelectElement);

str(HTMLSelectElement, "name");
// select[i] / select[i] = option forward to the options collection.
addOptionIndexHost(HTMLSelectElement.prototype, (self) => (self as HTMLSelectElement).options);
bool(HTMLSelectElement, "disabled multiple required");
ulong(HTMLSelectElement, "size", 0);
installAutocomplete(HTMLSelectElement);
