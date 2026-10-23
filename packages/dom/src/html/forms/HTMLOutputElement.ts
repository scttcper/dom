// https://html.spec.whatwg.org/#the-output-element
// https://html.spec.whatwg.org/#the-progress-element
// https://html.spec.whatwg.org/#the-meter-element
// https://html.spec.whatwg.org/#the-datalist-element

import { HTMLElement } from "../HTMLElement.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import { HTMLCollection } from "../../collections/HTMLCollection.ts";
import { T } from "../../nodes/tags.ts";
import { contentAttr, parseFloatingPoint, str, tokenList } from "../reflect.ts";
import { formOwner } from "./form-associated.ts";
import { LabelsNodeList } from "./collections.ts";
import { serializeFloat } from "./microsyntaxes.ts";
import { installConstraintValidation, V_CUSTOM_ERROR, type ConstraintValidation, type ValidityState } from "./validation.ts";

export class HTMLOutputElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#concept-output-default-value-override (null = none). */
  _defaultValueOverride: string | null;
  _customValidity: string;
  _validity: ValidityState | null;
  _labels: LabelsNodeList | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this._defaultValueOverride = null;
    this._customValidity = "";
    this._validity = null;
    this._labels = null;
  }

  get type(): string {
    return "output";
  }

  declare htmlFor: object;
  declare name: string;

  get form(): Element | null {
    const owner = formOwner(this._impl);
    return owner === null ? null : (owner.node as Element);
  }

  get labels(): LabelsNodeList {
    return (this._labels ??= new LabelsNodeList(this._impl));
  }

  /** https://html.spec.whatwg.org/#dom-output-defaultvalue */
  get defaultValue(): string {
    return this._defaultValueOverride ?? this.textContent;
  }

  set defaultValue(value: string) {
    if (this._defaultValueOverride === null) this.textContent = String(value);
    else this._defaultValueOverride = String(value);
  }

  /** https://html.spec.whatwg.org/#dom-output-value */
  get value(): string {
    return this.textContent;
  }

  set value(value: string) {
    this._defaultValueOverride = this.defaultValue;
    this.textContent = String(value);
  }

  /** https://html.spec.whatwg.org/#the-output-element:concept-form-reset-control */
  _reset(): void {
    this.textContent = this.defaultValue;
    this._defaultValueOverride = null;
  }

  // Output elements are always barred from constraint validation.
  _barredFromValidation(): boolean {
    return true;
  }

  _validityFlags(): number {
    return this._customValidity === "" ? 0 : V_CUSTOM_ERROR;
  }

  _validationMessage(_flags: number): string {
    return this._customValidity;
  }
}

export interface HTMLOutputElement extends ConstraintValidation {}
installConstraintValidation(HTMLOutputElement);

str(HTMLOutputElement, "name");
tokenList(HTMLOutputElement, "htmlFor", "for");

function attrFloat(el: HTMLElement, name: string): number {
  const v = contentAttr(el._impl, name);
  return v === null ? NaN : parseFloatingPoint(v);
}

function setFloat(el: HTMLElement, name: string, value: unknown): void {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError(`Failed to set the '${name}' property: The provided double value is non-finite.`);
  el.setAttribute(name, serializeFloat(n));
}

export class HTMLProgressElement extends HTMLElement {
  _labels: LabelsNodeList | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this._labels = null;
  }

  /** https://html.spec.whatwg.org/#dom-progress-max */
  get max(): number {
    const n = attrFloat(this, "max");
    return Number.isNaN(n) || n <= 0 ? 1 : n;
  }

  set max(value: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new TypeError("Failed to set the 'max' property on 'HTMLProgressElement': The provided double value is non-finite.");
    if (n > 0) this.setAttribute("max", serializeFloat(n));
  }

  /** https://html.spec.whatwg.org/#dom-progress-value */
  get value(): number {
    const n = attrFloat(this, "value");
    if (Number.isNaN(n) || n < 0) return 0;
    return Math.min(n, this.max);
  }

  set value(value: number) {
    setFloat(this, "value", value);
  }

  /** https://html.spec.whatwg.org/#dom-progress-position — -1 when indeterminate. */
  get position(): number {
    if (contentAttr(this._impl, "value") === null) return -1;
    return this.value / this.max;
  }

  get labels(): LabelsNodeList {
    return (this._labels ??= new LabelsNodeList(this._impl));
  }
}

/** https://html.spec.whatwg.org/#the-meter-element — the clamped values of the meter algorithm. */
export class HTMLMeterElement extends HTMLElement {
  _labels: LabelsNodeList | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this._labels = null;
  }

  get min(): number {
    const n = attrFloat(this, "min");
    return Number.isNaN(n) ? 0 : n;
  }

  set min(v: number) {
    setFloat(this, "min", v);
  }

  get max(): number {
    const min = this.min;
    const n = attrFloat(this, "max");
    const max = Number.isNaN(n) ? 1 : n;
    return Math.max(max, min);
  }

  set max(v: number) {
    setFloat(this, "max", v);
  }

  get value(): number {
    const min = this.min;
    const max = this.max;
    const n = attrFloat(this, "value");
    const v = Number.isNaN(n) ? 0 : n;
    return v < min ? min : v > max ? max : v;
  }

  set value(v: number) {
    setFloat(this, "value", v);
  }

  get low(): number {
    const min = this.min;
    const max = this.max;
    const n = attrFloat(this, "low");
    const low = Number.isNaN(n) ? min : n;
    return low < min ? min : low > max ? max : low;
  }

  set low(v: number) {
    setFloat(this, "low", v);
  }

  get high(): number {
    const low = this.low;
    const max = this.max;
    const n = attrFloat(this, "high");
    const high = Number.isNaN(n) ? max : n;
    return high < low ? low : high > max ? max : high;
  }

  set high(v: number) {
    setFloat(this, "high", v);
  }

  get optimum(): number {
    const min = this.min;
    const max = this.max;
    const n = attrFloat(this, "optimum");
    const opt = Number.isNaN(n) ? min + (max - min) / 2 : n;
    return opt < min ? min : opt > max ? max : opt;
  }

  set optimum(v: number) {
    setFloat(this, "optimum", v);
  }

  get labels(): LabelsNodeList {
    return (this._labels ??= new LabelsNodeList(this._impl));
  }
}

function isOption(el: { tag: number }): boolean {
  return el.tag === T.option;
}

export class HTMLDataListElement extends HTMLElement {
  _options: HTMLCollection | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this._options = null;
  }

  /** https://html.spec.whatwg.org/#dom-datalist-options */
  get options(): HTMLCollection {
    return (this._options ??= HTMLCollection._descendants(this._impl, isOption));
  }
}
