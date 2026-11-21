// https://html.spec.whatwg.org/#the-textarea-element
//
// The raw value follows the child text content (the default value) until the dirty value flag
// is set; that is derived on read, so no children-changed hook is needed and parser-built
// textareas work without hooks. Once dirty, store the newline-normalized API value: selection,
// validity and submission all use that representation.

import { HTMLElement } from "../HTMLElement.ts";
import { installAutocomplete } from "./autofill.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import { TEXT_NODE, CDATA_SECTION_NODE, F_CHILDREN_HOOK } from "../../nodes/constants.ts";
import { contentAttr, bool, nonNegativeLong, str } from "../reflect.ts";
import { normalizeNewlines, positiveWithFallback, readNonNegativeLong, toUnsignedLong } from "./common.ts";
import { formOwner, hasDatalistAncestor, isActuallyDisabled } from "./form-associated.ts";
import { LabelsNodeList } from "./collections.ts";
import { rangeText, setSelection } from "./HTMLInputElement.ts";
import {
  installConstraintValidation,
  MSG_FILL_OUT,
  msgTooLong,
  msgTooShort,
  V_CUSTOM_ERROR,
  V_TOO_LONG,
  V_TOO_SHORT,
  V_VALUE_MISSING,
  type ConstraintValidation,
  type ValidityState,
} from "./validation.ts";
import { $control, $customValidity, $impl, $labels, $userValidity, $validity, $version } from "../../keys.ts";
import { ControlState } from "./control-state.ts";

/**
 * https://infra.spec.whatwg.org/#normalize-newlines of `raw`, or the control's last result when
 * `raw` is the string it was for. React writes a controlled textarea's text twice per update,
 * to `value` and to `defaultValue`, and the value setter reads the old value first: with a long
 * CRLF text that was three passes over it per keystroke instead of one. The strings are the
 * ones the text node and the control hold anyway.
 */
function normalized(control: ControlState, raw: string): string {
  if (raw === control.rawText) return control.apiText;
  const api = normalizeNewlines(raw);
  control.rawText = raw;
  control.apiText = api;
  return api;
}

export class HTMLTextAreaElement extends HTMLElement {
  /** Value, checkedness, selection and UI state (./control-state.ts). */
  [$control]: ControlState;
  /** The custom validity error message; absent while it is the empty string. */
  declare [$customValidity]?: string;
  declare [$validity]?: ValidityState | null;
  declare [$labels]?: LabelsNodeList | null;
  /** https://html.spec.whatwg.org/#user-validity (forms/user-validity.ts); absent while false. */
  declare [$userValidity]?: boolean;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_CHILDREN_HOOK;
    this[$control] = new ControlState();
  }

  get type(): string {
    return "textarea";
  }

  /** https://html.spec.whatwg.org/#dom-textarea-defaultvalue — the child text content. */
  get defaultValue(): string {
    let s = "";
    for (let c = this[$impl].first; c !== null; c = c.next) {
      if (c.type === TEXT_NODE || c.type === CDATA_SECTION_NODE) s += c.data;
    }
    return s;
  }

  set defaultValue(value: string) {
    this.textContent = String(value);
  }

  /** https://html.spec.whatwg.org/#concept-fe-api-value */
  _apiValue(): string {
    const control = this[$control];
    return control.dirtyValue ? control.value : normalized(control, this.defaultValue);
  }

  /** https://html.spec.whatwg.org/#dom-textarea-value */
  get value(): string {
    return this._apiValue();
  }

  set value(v: string) {
    // The old value first: it is usually the text `normalized` was last asked about.
    const old = this._apiValue();
    const value = v === null ? "" : normalized(this[$control], String(v)); // [LegacyNullToEmptyString]
    this[$impl].doc[$version]++;
    this[$control].value = value;
    this[$control].dirtyValue = true;
    this[$control].userEdited = false;
    if (value !== old) {
      this[$control].selStart = value.length;
      this[$control].selEnd = value.length;
      this[$control].selDir = "none";
    }
  }

  /** https://html.spec.whatwg.org/#dom-textarea-textlength */
  get textLength(): number {
    return this._apiValue().length;
  }

  get form(): Element | null {
    const owner = formOwner(this[$impl]);
    return owner === null ? null : (owner.node as Element);
  }

  get labels(): LabelsNodeList {
    return (this[$labels] ??= new LabelsNodeList(this[$impl]));
  }

  declare autocomplete: string;
  declare cols: number;
  declare dirName: string;
  declare disabled: boolean;
  declare maxLength: number;
  declare minLength: number;
  declare name: string;
  declare placeholder: string;
  declare readOnly: boolean;
  declare required: boolean;
  declare rows: number;
  declare wrap: string;

  // --- selection -----------------------------------------------------------------------------

  _selectionLength(): number {
    return this._apiValue().length;
  }

  get selectionStart(): number {
    return Math.min(this[$control].selStart, this._selectionLength());
  }

  set selectionStart(value: number) {
    const start = toUnsignedLong(value);
    setSelection(this, start, Math.max(start, this.selectionEnd), this[$control].selDir);
  }

  get selectionEnd(): number {
    return Math.min(this[$control].selEnd, this._selectionLength());
  }

  set selectionEnd(value: number) {
    setSelection(this, this.selectionStart, toUnsignedLong(value), this[$control].selDir);
  }

  get selectionDirection(): string {
    return this[$control].selDir;
  }

  set selectionDirection(value: string) {
    setSelection(this, this.selectionStart, this.selectionEnd, String(value));
  }

  setSelectionRange(start: number, end: number, direction?: string): void {
    setSelection(
      this,
      toUnsignedLong(start),
      toUnsignedLong(end),
      direction === undefined ? "none" : String(direction),
    );
  }

  select(): void {
    setSelection(this, 0, this._selectionLength(), "none");
  }

  setRangeText(replacement: string, start?: number, end?: number, selectionMode?: string): void {
    if (arguments.length === 0)
      throw new TypeError(
        "Failed to execute 'setRangeText' on 'HTMLTextAreaElement': 1 argument required, but only 0 present.",
      );
    const result = rangeText(
      this._apiValue(),
      this[$control].selStart,
      this[$control].selEnd,
      String(replacement),
      start,
      end,
      selectionMode,
      arguments.length,
    );
    this[$impl].doc[$version]++;
    this[$control].value = normalizeNewlines(result.value);
    this[$control].dirtyValue = true;
    setSelection(this, result.start, result.end, "none");
  }

  // --- constraint validation -----------------------------------------------------------------

  _isMutable(): boolean {
    return !isActuallyDisabled(this[$impl]) && contentAttr(this[$impl], "readonly") === null;
  }

  _barredFromValidation(): boolean {
    const impl = this[$impl];
    return contentAttr(impl, "readonly") !== null || isActuallyDisabled(impl) || hasDatalistAncestor(impl);
  }

  _validityFlags(): number {
    const impl = this[$impl];
    let flags = this[$customValidity] ? V_CUSTOM_ERROR : 0;
    const value = this._apiValue();
    if (contentAttr(impl, "required") !== null && this._isMutable() && value === "") flags |= V_VALUE_MISSING;
    if (this[$control].userEdited && value !== "") {
      const max = readNonNegativeLong(impl, "maxlength", -1);
      if (max !== -1 && value.length > max) flags |= V_TOO_LONG;
      const min = readNonNegativeLong(impl, "minlength", -1);
      if (min !== -1 && value.length < min) flags |= V_TOO_SHORT;
    }
    return flags;
  }

  _validationMessage(flags: number): string {
    if ((flags & V_VALUE_MISSING) !== 0) return MSG_FILL_OUT;
    const len = this._apiValue().length;
    if ((flags & V_TOO_LONG) !== 0) return msgTooLong(this.maxLength, len);
    if ((flags & V_TOO_SHORT) !== 0) return msgTooShort(this.minLength, len);
    return this[$customValidity] ?? "";
  }

  // --- algorithms -----------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#the-textarea-element:concept-form-reset-control */
  _reset(): void {
    if (this[$userValidity]) this[$userValidity] = false;
    this[$control].dirtyValue = false;
    this[$control].userEdited = false;
    this[$control].value = "";
  }

  /**
   * Children changed: while the dirty value flag is unset the raw value is the child text
   * content, so a shorter value clamps the selection for good (a later longer value does not
   * bring the old offsets back). https://html.spec.whatwg.org/#concept-textarea-raw-value,
   * https://html.spec.whatwg.org/#textFieldSelection ("the selection ... must be adjusted").
   */
  override _childrenChangedSteps(): void {
    if (this[$control].dirtyValue) return;
    const len = this._selectionLength();
    if (this[$control].selStart > len) this[$control].selStart = len;
    if (this[$control].selEnd > len) this[$control].selEnd = len;
  }

  /** https://html.spec.whatwg.org/#the-textarea-element:concept-node-clone-ext */
  override _cloningSteps(copy: Element): void {
    const c = copy as HTMLTextAreaElement;
    c[$control].value = this[$control].value;
    c[$control].dirtyValue = this[$control].dirtyValue;
  }
}

export interface HTMLTextAreaElement extends ConstraintValidation {}
installConstraintValidation(HTMLTextAreaElement);

str(HTMLTextAreaElement, "dirName=dirname name placeholder wrap");
bool(HTMLTextAreaElement, "disabled readOnly=readonly required");
nonNegativeLong(HTMLTextAreaElement, "maxLength=maxlength minLength=minlength", -1);
positiveWithFallback(HTMLTextAreaElement, "cols", "cols", 20);
positiveWithFallback(HTMLTextAreaElement, "rows", "rows", 2);
installAutocomplete(HTMLTextAreaElement);
