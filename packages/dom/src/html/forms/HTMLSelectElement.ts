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
import { F_ATTR_HOOK, F_CHILDREN_HOOK, F_CONNECT_HOOK, HTML_NS } from "../../nodes/constants.ts";
import { T } from "../../nodes/tags.ts";
import { nextInTree, nextSkippingChildren } from "../../nodes/traverse.ts";
import { HTMLCollection } from "../../collections/HTMLCollection.ts";
import { bool, contentAttr, parseNonNegativeInteger, str, ulong } from "../reflect.ts";
import { hasDatalistAncestor, isActuallyDisabled } from "./form-associated.ts";
import {
  addOptionIndexHost,
  HTMLOptionsCollection,
  labelsMember,
  listOfOptions,
  scanOptions,
  type LabelsNodeList,
} from "./collections.ts";
import { installDefaults } from "./common.ts";
import {
  installConstraintValidation,
  MSG_SELECT,
  V_CUSTOM_ERROR,
  V_VALUE_MISSING,
  type ConstraintValidation,
  type ValidityState,
} from "./validation.ts";
import { selectedness, type HTMLOptionElement } from "./HTMLOptionElement.ts";
import {
  $customValidity,
  $dirtiness,
  $impl,
  $labels,
  $options,
  $optionsCount,
  $optionsOnly,
  $optionsTail,
  $selectedOptions,
  $selectionEpoch,
  $settled,
  $updatingSelectedContent,
  $userValidity,
  $validity,
} from "../../keys.ts";

function opt(o: NodeImpl): HTMLOptionElement {
  return o.node as HTMLOptionElement;
}

function firstSelectedOption(select: NodeImpl): NodeImpl | undefined {
  return scanOptions(select, (option) => (opt(option)._selectednessNow() ? option : undefined));
}

/**
 * React appends options one by one. Walk direct options without allocating the list each time.
 * An explicit selection wins over its siblings. Otherwise a single existing selection is already
 * settled. A flat menu also has no selectedcontent to update.
 */
function settleFlatOptions(select: NodeImpl, selected: NodeImpl | undefined): boolean {
  let hasSelection = false;
  for (let child = select.first; child !== null; child = child.next) {
    if (child.type !== 1) continue;
    if (child.tag !== T.option) return false;
    if (selected !== undefined) {
      if (child !== selected) opt(child)._setSelectedness(false);
    } else if (opt(child)._selectednessNow()) {
      if (hasSelection) return false;
      hasSelection = true;
    }
  }
  return selected !== undefined || hasSelection;
}

function onlyOptions(select: NodeImpl): boolean {
  for (let child = select.first; child !== null; child = child.next) {
    if (child.tag !== T.option || child.ns !== HTML_NS) return false;
  }
  return true;
}

/** select.selectedOptions: https://html.spec.whatwg.org/#dom-select-selectedoptions */
class SelectedOptionsCollection extends HTMLCollection {
  override _collect(out: Element[]): void {
    scanOptions(this._s.root, (option) => {
      if (opt(option)._selectednessNow()) out.push(option.node as Element);
    });
  }
}

// selectedOptions is a plain HTMLCollection as far as script can tell (WPT select-selectedOptions.html).
Object.defineProperty(SelectedOptionsCollection.prototype, "constructor", {
  value: HTMLCollection,
  writable: true,
  configurable: true,
});

export class HTMLSelectElement extends HTMLElement {
  /** The custom validity error message; absent while it is the empty string. */
  declare [$customValidity]?: string;
  declare [$validity]?: ValidityState | null;
  declare [$labels]?: LabelsNodeList | null;
  declare [$options]: HTMLOptionsCollection | null;
  declare [$selectedOptions]: HTMLCollection | null;
  /**
   * The selectedness setting algorithm has run at least once. Trees built by the parser or by
   * cloning attach options without hooks; the first read (or insertion) settles them.
   */
  declare [$settled]: boolean;
  /** Re-entrancy guard for `_updateSelectedContent` (it mutates the select's subtree). */
  declare [$updatingSelectedContent]: boolean;
  /** The last child and the child count at the last children-changed step: tell one appended child from any other change. */
  declare [$optionsTail]: NodeImpl | null;
  declare [$optionsCount]: number;
  /** Every child is an HTML option element (no optgroup, hr, selectedcontent or text). */
  declare [$optionsOnly]: boolean;
  /** `selectedness.epoch` when the algorithm last left exactly one option selected, else -1. */
  declare [$selectionEpoch]: number;
  /** https://html.spec.whatwg.org/#user-validity (forms/user-validity.ts); absent while false. */
  declare [$userValidity]?: boolean;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_CHILDREN_HOOK | F_ATTR_HOOK | F_CONNECT_HOOK;
    this[$options] = null;
    this[$selectedOptions] = null;
    this[$settled] = false;
    this[$updatingSelectedContent] = false;
    this[$optionsTail] = null;
    this[$optionsCount] = 0;
    this[$optionsOnly] = true;
    this[$selectionEpoch] = -1;
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
    let count = 0;
    scanOptions(this[$impl], () => {
      count++;
    });
    return count;
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
    return scanOptions(this[$impl], (option, index) => (opt(option)._selectednessNow() ? index : undefined)) ?? -1;
  }

  set selectedIndex(value: number) {
    const index = Number(value) | 0;
    scanOptions(this[$impl], (option, i) => {
      const selected = i === index;
      opt(option)._setSelectedness(selected);
      if (selected) opt(option)[$dirtiness] = true;
    });
    this._updateSelectedContent();
  }

  /** https://html.spec.whatwg.org/#dom-select-value */
  get value(): string {
    const selected = firstSelectedOption(this[$impl]);
    return selected === undefined ? "" : opt(selected).value;
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

  declare readonly labels: LabelsNodeList;

  declare autocomplete: string;
  declare disabled: boolean;
  declare multiple: boolean;
  declare name: string;
  declare required: boolean;
  declare size: number;

  /** https://html.spec.whatwg.org/#dom-select-showpicker — no picker UI. */
  showPicker(): void {
    if (isActuallyDisabled(this[$impl])) {
      throw new DOMException(
        "Failed to execute 'showPicker' on 'HTMLSelectElement': HTMLSelectElement::showPicker() cannot be used on immutable controls.",
        "InvalidStateError",
      );
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
    scanOptions(this[$impl], (option) => {
      if (option !== selected) opt(option)._setSelectedness(false);
    });
  }

  /** https://html.spec.whatwg.org/#selectedness-setting-algorithm */
  _selectednessSettingAlgorithm(selected?: NodeImpl): void {
    this[$settled] = true;
    if (!this._isSingle()) return;
    if (selected !== undefined || this._displaySize() === 1) {
      if (settleFlatOptions(this[$impl], selected)) return;
      if (selected !== undefined) this._deselectOthers(selected);
      else this._runSelectedness();
    }
    this._updateSelectedContent();
  }

  _runSelectedness(): void {
    let selected: HTMLOptionElement | undefined;
    scanOptions(this[$impl], (node) => {
      const option = opt(node);
      if (option._selectednessNow()) {
        selected?._setSelectedness(false);
        selected = option;
      }
    });
    if (selected === undefined) {
      // Select the first non-disabled option in tree order, if any.
      const first = scanOptions(this[$impl], (node) => (isActuallyDisabled(node) ? undefined : opt(node)));
      first?._setSelectedness(true);
    }
  }

  // --- <selectedcontent> ---------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#get-a-select's-enabled-selectedcontent */
  _enabledSelectedContent(): NodeImpl | null {
    const impl = this[$impl];
    if (contentAttr(impl, "multiple") !== null) return null;
    for (let n = impl.first; n !== null;) {
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
      const selected = firstSelectedOption(this[$impl]);
      const target = sc.node as Element;
      if (selected === undefined) {
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
    if (this[$userValidity]) this[$userValidity] = false;
    this[$settled] = true;
    const options = listOfOptions(this[$impl], []);
    for (let i = 0; i < options.length; i++) {
      const o = opt(options[i]);
      o[$dirtiness] = false;
      o._setSelectedness(contentAttr(options[i], "selected") !== null);
    }
    this._selectednessSettingAlgorithm();
  }

  /**
   * The list of options changed: https://html.spec.whatwg.org/#the-select-element:selectedness-setting-algorithm
   *
   * React appends a select's options one by one, and the algorithm walks the options each time
   * (65 µs to build a select of 250). It has nothing to do when a drop-down that has exactly one
   * selected option gets one more option at the end that is not selected, which is every append
   * after the first: that case returns here. The select knows it without a walk while no
   * option's selectedness has changed anywhere since the algorithm last left it with one
   * (`selectedness.epoch`), its children are all options, and the new child follows the last
   * one it saw. Anything else runs the algorithm as before.
   */
  override _childrenChangedSteps(): void {
    const impl = this[$impl];
    const last = impl.last;
    const appended =
      this[$optionsOnly] &&
      impl.childCount === this[$optionsCount] + 1 &&
      last !== null &&
      last.prev === this[$optionsTail] &&
      last.tag === T.option &&
      last.ns === HTML_NS;
    this[$optionsTail] = last;
    this[$optionsCount] = impl.childCount;
    if (!appended) this[$optionsOnly] = onlyOptions(impl);
    else if (
      this[$selectionEpoch] === selectedness.epoch &&
      this._isSingle() &&
      this._displaySize() === 1 &&
      !opt(last!)._selectednessNow()
    ) {
      return;
    }
    this._selectednessSettingAlgorithm();
    this[$selectionEpoch] =
      this[$optionsOnly] && this._isSingle() && this._displaySize() === 1 && firstSelectedOption(impl) !== undefined
        ? selectedness.epoch
        : -1;
  }

  override _attributeChangedSteps(
    localName: string,
    oldValue: string | null,
    value: string | null,
    namespace: string | null,
  ): void {
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
  private _isPlaceholderLabelOption(first: NodeImpl): boolean {
    return first.parent === this[$impl] && this._isSingle() && this._displaySize() === 1 && opt(first).value === "";
  }

  _validityFlags(): number {
    let flags = this[$customValidity] ? V_CUSTOM_ERROR : 0;
    if (contentAttr(this[$impl], "required") !== null) {
      const hasValue = scanOptions(this[$impl], (option, index) => {
        if (opt(option)._selectednessNow() && (index !== 0 || !this._isPlaceholderLabelOption(option))) return true;
      });
      if (!hasValue) flags |= V_VALUE_MISSING;
    }
    return flags;
  }

  _validationMessage(flags: number): string {
    if ((flags & V_VALUE_MISSING) !== 0) return MSG_SELECT;
    return this[$customValidity] ?? "";
  }
}

export interface HTMLSelectElement extends ConstraintValidation {}
installConstraintValidation(HTMLSelectElement);
installDefaults(HTMLSelectElement, labelsMember);

str(HTMLSelectElement, "name");
// select[i] / select[i] = option forward to the options collection.
addOptionIndexHost(HTMLSelectElement.prototype, (self) => (self as HTMLSelectElement).options);
bool(HTMLSelectElement, "disabled multiple required");
ulong(HTMLSelectElement, "size", 0);
installAutocomplete(HTMLSelectElement);
