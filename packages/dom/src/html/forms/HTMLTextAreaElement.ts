// https://html.spec.whatwg.org/#the-textarea-element
//
// The raw value follows the child text content (the default value) until the dirty value flag
// is set; that is derived on read, so no children-changed hook is needed and parser-built
// textareas work without hooks. The API value is the raw value with newlines normalized.

import { HTMLElement } from "../HTMLElement.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import { TEXT_NODE, CDATA_SECTION_NODE } from "../../nodes/constants.ts";
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

export class HTMLTextAreaElement extends HTMLElement {
  /** Raw value while the dirty value flag is set. */
  _rawValue: string;
  /** https://html.spec.whatwg.org/#concept-textarea-dirty */
  _dirtyValue: boolean;
  _selStart: number;
  _selEnd: number;
  _selDir: "forward" | "backward" | "none";
  _customValidity: string;
  _validity: ValidityState | null;
  _labels: LabelsNodeList | null;
  /** The value was last changed by a user edit (tooLong/tooShort only apply then). */
  _userEdited: boolean;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this._rawValue = "";
    this._dirtyValue = false;
    this._selStart = 0;
    this._selEnd = 0;
    this._selDir = "none";
    this._customValidity = "";
    this._validity = null;
    this._labels = null;
    this._userEdited = false;
  }

  get type(): string {
    return "textarea";
  }

  /** https://html.spec.whatwg.org/#dom-textarea-defaultvalue — the child text content. */
  get defaultValue(): string {
    let s = "";
    for (let c = this._impl.first; c !== null; c = c.next) {
      if (c.type === TEXT_NODE || c.type === CDATA_SECTION_NODE) s += c.data;
    }
    return s;
  }

  set defaultValue(value: string) {
    this.textContent = String(value);
  }

  /** https://html.spec.whatwg.org/#concept-textarea-raw-value */
  _rawValueNow(): string {
    return this._dirtyValue ? this._rawValue : this.defaultValue;
  }

  /** https://html.spec.whatwg.org/#concept-fe-api-value */
  _apiValue(): string {
    return normalizeNewlines(this._rawValueNow());
  }

  /** https://html.spec.whatwg.org/#dom-textarea-value */
  get value(): string {
    return this._apiValue();
  }

  set value(v: string) {
    const value = v === null ? "" : String(v); // [LegacyNullToEmptyString]
    const old = this._apiValue();
    this._impl.doc._version++;
    this._rawValue = value;
    this._dirtyValue = true;
    this._userEdited = false;
    const now = this._apiValue();
    if (now !== old) {
      this._selStart = now.length;
      this._selEnd = now.length;
      this._selDir = "none";
    }
  }

  /** https://html.spec.whatwg.org/#dom-textarea-textlength */
  get textLength(): number {
    return this._apiValue().length;
  }

  get form(): Element | null {
    const owner = formOwner(this._impl);
    return owner === null ? null : (owner.node as Element);
  }

  get labels(): LabelsNodeList {
    return (this._labels ??= new LabelsNodeList(this._impl));
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
    return Math.min(this._selStart, this._selectionLength());
  }

  set selectionStart(value: number) {
    const start = toUnsignedLong(value);
    setSelection(this, start, Math.max(start, this.selectionEnd), this._selDir);
  }

  get selectionEnd(): number {
    return Math.min(this._selEnd, this._selectionLength());
  }

  set selectionEnd(value: number) {
    setSelection(this, this.selectionStart, toUnsignedLong(value), this._selDir);
  }

  get selectionDirection(): string {
    return this._selDir;
  }

  set selectionDirection(value: string) {
    setSelection(this, this.selectionStart, this.selectionEnd, String(value));
  }

  setSelectionRange(start: number, end: number, direction?: string): void {
    setSelection(this, toUnsignedLong(start), toUnsignedLong(end), direction === undefined ? "none" : String(direction));
  }

  select(): void {
    setSelection(this, 0, this._selectionLength(), "none");
  }

  setRangeText(replacement: string, start?: number, end?: number, selectionMode?: string): void {
    const result = rangeText(this._apiValue(), this._selStart, this._selEnd, String(replacement), start, end, selectionMode, arguments.length);
    this._impl.doc._version++;
    this._rawValue = result.value;
    this._dirtyValue = true;
    setSelection(this, result.start, result.end, "none");
  }

  // --- constraint validation -----------------------------------------------------------------

  _isMutable(): boolean {
    return !isActuallyDisabled(this._impl) && contentAttr(this._impl, "readonly") === null;
  }

  _barredFromValidation(): boolean {
    const impl = this._impl;
    return contentAttr(impl, "readonly") !== null || isActuallyDisabled(impl) || hasDatalistAncestor(impl);
  }

  _validityFlags(): number {
    const impl = this._impl;
    let flags = this._customValidity === "" ? 0 : V_CUSTOM_ERROR;
    const value = this._apiValue();
    if (contentAttr(impl, "required") !== null && this._isMutable() && value === "") flags |= V_VALUE_MISSING;
    if (this._userEdited && value !== "") {
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
    return this._customValidity;
  }

  // --- algorithms -----------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#the-textarea-element:concept-form-reset-control */
  _reset(): void {
    this._dirtyValue = false;
    this._userEdited = false;
    this._rawValue = "";
  }

  /** https://html.spec.whatwg.org/#the-textarea-element:concept-node-clone-ext */
  override _cloningSteps(copy: Element): void {
    const c = copy as HTMLTextAreaElement;
    c._rawValue = this._rawValue;
    c._dirtyValue = this._dirtyValue;
  }
}

export interface HTMLTextAreaElement extends ConstraintValidation {}
installConstraintValidation(HTMLTextAreaElement);

str(HTMLTextAreaElement, "autocomplete dirName=dirname name placeholder wrap");
bool(HTMLTextAreaElement, "disabled readOnly=readonly required");
nonNegativeLong(HTMLTextAreaElement, "maxLength=maxlength minLength=minlength", -1);
positiveWithFallback(HTMLTextAreaElement, "cols", "cols", 20);
positiveWithFallback(HTMLTextAreaElement, "rows", "rows", 2);
