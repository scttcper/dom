// https://html.spec.whatwg.org/#the-input-element
//
// State lives on the wrapper in fixed-shape fields initialized in the constructor. Values
// that derive from content attributes (the value while the dirty value flag is false, the
// checkedness while it has not been set explicitly) are derived on read, because the parser
// and cloning attach attributes without running attribute-change hooks.
//
// React's inputValueTracking reads `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,
// "value" | "checked")` and redefines the property on the instance, forwarding to these
// accessors. Internal state changes that are NOT script assignments (user edits, click
// activation, reset) therefore write the fields directly and never go through `this.value =` /
// `this.checked =`, so React's tracker sees the change and fires onChange.

import { HTMLElement } from "../HTMLElement.ts";
import { installAutocomplete } from "./autofill.ts";
import type { Document } from "../../nodes/Document.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import type { Element } from "../../nodes/Element.ts";
import type { Event } from "../../events/Event.ts";
import { F_ATTR_HOOK, F_CONNECT_HOOK, F_CONNECTED, ELEMENT_NODE } from "../../nodes/constants.ts";
import { T } from "../../nodes/tags.ts";
import { attr, setAttribute } from "../../nodes/attributes.ts";
import { nextElementInTree, treeRoot } from "../../nodes/traverse.ts";
import { fireEvent, readNonNegativeLong, reflectActionURL, stripNewlines, toUnsignedLong, trimASCII } from "./common.ts";
import { bool, enumerated, nonNegativeLong, str, ulong, url } from "../reflect.ts";
import {
  I_BUTTON,
  I_CHECKBOX,
  I_COLOR,
  I_DATE,
  I_DATETIME_LOCAL,
  I_EMAIL,
  I_FILE,
  I_HIDDEN,
  I_IMAGE,
  I_MONTH,
  I_NUMBER,
  I_PASSWORD,
  I_RADIO,
  I_RANGE,
  I_RESET,
  I_SEARCH,
  I_SUBMIT,
  I_TEL,
  I_TEXT,
  I_TIME,
  I_URL,
  I_WEEK,
  INPUT_TYPE_NAMES,
  MODE_DEFAULT,
  MODE_DEFAULT_ON,
  MODE_FILENAME,
  MODE_VALUE,
  inputType,
  inputTypeFromAttr,
  isNumericType,
  lengthApplies,
  listApplies,
  readonlyApplies,
  requiredApplies,
  supportsSelectionType,
  valueMode,
} from "./input-type.ts";
import {
  isValidAbsoluteURL,
  isValidDateString,
  isValidFloatString,
  isValidMonthString,
  isValidWeekString,
  normalizeLocalDateTime,
  isValidEmail,
  isValidSimpleColor,
  parseDate,
  parseFloatLenient,
  parseFloatStrict,
  parseLocalDateTime,
  parseMonth,
  parseTime,
  parseWeek,
  serializeDate,
  serializeFloat,
  serializeLocalDateTime,
  serializeMonth,
  serializeTime,
  serializeWeek,
  utcMs,
} from "./microsyntaxes.ts";
import { elementByIdInTree, formOwner, hasDatalistAncestor, isActuallyDisabled } from "./form-associated.ts";
import { LabelsNodeList } from "./collections.ts";
import { FileList, createFileList } from "../../window/FileList.ts";
import { queueTask } from "../events.ts";
import { popoverTargetAttributeActivation } from "../invokers.ts";
import type { EventTarget } from "../../events/EventTarget.ts";
import { $badInput, $checked, $checkedSet, $customValidity, $dirtyChecked, $dirtyValue, $files, $impl, $indeterminate, $labels, $preApplied, $preChecked, $preCheckedRadio, $preIndeterminate, $selDir, $selEnd, $selStart, $uiValue, $userEdited, $validity, $value, $version } from "../../keys.ts";

/** Accept a FileList or any array-like of File (user-event and tests build lists by hand). */
function toFileList(value: unknown): FileList {
  if (value instanceof FileList) return value;
  if (value !== null && typeof value === "object" && typeof (value as { length?: unknown }).length === "number") {
    const like = value as ArrayLike<File>;
    const files: File[] = [];
    for (let i = 0; i < like.length; i++) files.push(like[i]);
    return createFileList(files);
  }
  throw new TypeError("Failed to set the 'files' property on 'HTMLInputElement': The provided value is not of type 'FileList'.");
}
import {
  installConstraintValidation,
  MSG_BAD_INPUT,
  MSG_CHECKBOX,
  MSG_FILE,
  MSG_FILL_OUT,
  MSG_NUMBER,
  MSG_PATTERN,
  MSG_RADIO,
  MSG_URL,
  msgEmail,
  msgOverflow,
  msgStep,
  msgTooLong,
  msgTooShort,
  msgUnderflow,
  V_BAD_INPUT,
  V_CUSTOM_ERROR,
  V_PATTERN_MISMATCH,
  V_RANGE_OVERFLOW,
  V_RANGE_UNDERFLOW,
  V_STEP_MISMATCH,
  V_TOO_LONG,
  V_TOO_SHORT,
  V_TYPE_MISMATCH,
  V_VALUE_MISSING,
  type ConstraintValidation,
  type ValidityState,
} from "./validation.ts";
import { FORM_ENCTYPE, FORM_METHOD, resetForm, submitForm } from "./form-submission.ts";

// --- value sanitization ---------------------------------------------------------------------

/** https://html.spec.whatwg.org/#value-sanitization-algorithm for each type. */
export function sanitizeValue(type: number, value: string, impl: NodeImpl): string {
  switch (type) {
    case I_TEXT:
    case I_SEARCH:
    case I_TEL:
    case I_PASSWORD:
      return stripNewlines(value);
    case I_URL:
      return trimASCII(stripNewlines(value));
    case I_EMAIL: {
      if (attr(impl, "multiple") === null) return trimASCII(stripNewlines(value));
      // Split on commas, strip leading/trailing whitespace from each, join with ",".
      if (value.indexOf(",") === -1) return trimASCII(stripNewlines(value));
      const parts = value.split(",");
      for (let i = 0; i < parts.length; i++) parts[i] = trimASCII(stripNewlines(parts[i]));
      return parts.join(",");
    }
    case I_NUMBER:
      return Number.isNaN(parseFloatStrict(value)) ? "" : value;
    case I_RANGE:
      return sanitizeRange(value, impl);
    case I_DATE:
      return isValidDateString(value) ? value : "";
    case I_MONTH:
      return isValidMonthString(value) ? value : "";
    case I_WEEK:
      return isValidWeekString(value) ? value : "";
    case I_TIME:
      return Number.isNaN(parseTime(value)) ? "" : value;
    case I_DATETIME_LOCAL: {
      // Valid local date-time strings are normalized (T separator, shortest time).
      return normalizeLocalDateTime(value);
    }
    case I_COLOR:
      return isValidSimpleColor(value) ? value.toLowerCase() : "#000000";
  }
  return value;
}

/**
 * https://html.spec.whatwg.org/#range-state-(type=range) — invalid values become the default
 * value; the UA also keeps the value within [min, max] and on a step.
 */
function sanitizeRange(value: string, impl: NodeImpl): string {
  const min = rangeMin(impl);
  let max = rangeMax(impl);
  if (max < min) max = min;
  const parsed = parseFloatStrict(value);
  let n = Number.isNaN(parsed) ? min + (max - min) / 2 : parsed;
  if (n < min) n = min;
  if (n > max) n = max;
  const step = allowedStep(I_RANGE, impl);
  if (!Number.isNaN(step)) {
    const base = stepBase(I_RANGE, impl);
    const k = (n - base) / step;
    const rounded = Math.round(k); // ties toward +∞ (Math.round)
    if (!isIntegral(k)) {
      let candidate = roundForStep(base + rounded * step, step, base);
      if (candidate > max) candidate = roundForStep(base + Math.floor((max - base) / step) * step, step, base);
      n = candidate;
    }
  }
  // A valid value that needed no adjustment is kept as written ("1e1" stays "1e1").
  if (n === parsed) return value;
  return serializeFloat(n);
}

function rangeMin(impl: NodeImpl): number {
  const v = attr(impl, "min");
  const n = v === null ? NaN : parseFloatLenient(v);
  return Number.isNaN(n) ? 0 : n;
}

function rangeMax(impl: NodeImpl): number {
  const v = attr(impl, "max");
  const n = v === null ? NaN : parseFloatLenient(v);
  return Number.isNaN(n) ? 100 : n;
}

// --- string ↔ number per type ----------------------------------------------------------------

/** https://html.spec.whatwg.org/#concept-input-value-string-number — NaN on error. */
export function stringToNumber(type: number, s: string): number {
  switch (type) {
    case I_NUMBER:
    case I_RANGE:
      return parseFloatStrict(s);
    case I_DATE:
      return parseDate(s);
    case I_MONTH:
      return parseMonth(s);
    case I_WEEK:
      return parseWeek(s);
    case I_TIME:
      return parseTime(s);
    case I_DATETIME_LOCAL:
      return parseLocalDateTime(s);
  }
  return NaN;
}

/** https://html.spec.whatwg.org/#concept-input-value-number-string */
export function numberToString(type: number, n: number): string {
  switch (type) {
    case I_NUMBER:
    case I_RANGE:
      return serializeFloat(n);
    case I_DATE:
      return serializeDate(n);
    case I_MONTH:
      return serializeMonth(n);
    case I_WEEK:
      return serializeWeek(n);
    case I_TIME:
      return serializeTime(n);
    case I_DATETIME_LOCAL:
      return serializeLocalDateTime(n);
  }
  return "";
}

/** Attribute parse for min/max/step base: numbers are parsed leniently, dates strictly. */
function attrToNumber(type: number, s: string | null): number {
  if (s === null) return NaN;
  if (type === I_NUMBER || type === I_RANGE) return parseFloatLenient(s);
  return stringToNumber(type, s);
}

// --- steps ------------------------------------------------------------------------------------

function defaultStep(type: number): number {
  return type === I_TIME || type === I_DATETIME_LOCAL ? 60 : 1;
}

function stepScale(type: number): number {
  switch (type) {
    case I_DATE:
      return 86400000;
    case I_WEEK:
      return 604800000;
    case I_TIME:
    case I_DATETIME_LOCAL:
      return 1000;
  }
  return 1;
}

/** https://html.spec.whatwg.org/#concept-input-step — NaN when there is no allowed value step ("any"). */
function allowedStep(type: number, impl: NodeImpl): number {
  const s = attr(impl, "step");
  if (s !== null) {
    if (s.toLowerCase() === "any") return NaN;
    let n = parseFloatLenient(s);
    if (!Number.isNaN(n) && n > 0) {
      if (type === I_DATE || type === I_MONTH || type === I_WEEK) n = Math.max(1, Math.round(n));
      return n * stepScale(type);
    }
  }
  return defaultStep(type) * stepScale(type);
}

/** https://html.spec.whatwg.org/#concept-input-min-zero */
function stepBase(type: number, impl: NodeImpl): number {
  let n = attrToNumber(type, attr(impl, "min"));
  if (!Number.isNaN(n)) return n;
  n = attrToNumber(type, attr(impl, "value"));
  if (!Number.isNaN(n)) return n;
  return type === I_WEEK ? -259200000 : 0;
}

function minimum(type: number, impl: NodeImpl): number {
  if (type === I_RANGE) return rangeMin(impl);
  return attrToNumber(type, attr(impl, "min"));
}

function maximum(type: number, impl: NodeImpl): number {
  if (type === I_RANGE) {
    const min = rangeMin(impl);
    const max = rangeMax(impl);
    return max < min ? min : max;
  }
  return attrToNumber(type, attr(impl, "max"));
}

/**
 * Whether `n` is `base` plus an integral multiple of `step` (https://html.spec.whatwg.org/#concept-input-step,
 * "suffering from a step mismatch"). Browsers use decimal arithmetic: the three numbers are
 * taken as their shortest decimal representations and compared exactly with BigInts, so a step
 * of 3e-15 still mismatches 17 (a float quotient would round to an integer).
 */
function isStepAligned(n: number, base: number, step: number): boolean {
  const k = (n - base) / step;
  // Fast path: comfortably integral or comfortably not, as doubles.
  if (Math.abs(k) < 1e6) return isIntegral(k);
  const a = toDecimal(n);
  const b = toDecimal(base);
  const s = toDecimal(step);
  if (a === null || b === null || s === null) return isIntegral(k);
  const exp = Math.min(a.exp, b.exp, s.exp);
  const scale = (d: { digits: bigint; exp: number }) => d.digits * 10n ** BigInt(d.exp - exp);
  const sd = scale(s);
  return sd === 0n || (scale(a) - scale(b)) % sd === 0n;
}

/** A finite double as digits × 10^exp, from its shortest round-trip string; null when absurdly scaled. */
function toDecimal(x: number): { digits: bigint; exp: number } | null {
  if (!Number.isFinite(x)) return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(x));
  if (m === null) return null;
  const frac = m[3] ?? "";
  const exp = (m[4] === undefined ? 0 : Number(m[4])) - frac.length;
  if (exp < -400 || exp > 400) return null;
  const digits = BigInt(m[2] + frac);
  return { digits: m[1] === "-" ? -digits : digits, exp };
}

function isIntegral(k: number): boolean {
  return Math.abs(k - Math.round(k)) < 1e-9 * Math.max(1, Math.abs(k));
}

function decimals(n: number): number {
  const s = String(n);
  const e = s.indexOf("e-");
  if (e !== -1) return Number(s.slice(e + 2)) + (s.indexOf(".") === -1 ? 0 : e - s.indexOf(".") - 1);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Remove binary floating-point noise from base + k*step (browsers use decimal arithmetic). */
function roundForStep(x: number, step: number, base: number): number {
  const d = Math.min(15, Math.max(decimals(step), decimals(base)));
  const r = Number(x.toFixed(d));
  return r === 0 ? 0 : r;
}

// --- the element -------------------------------------------------------------------------------

const DIRECTIONS = ["forward", "backward", "none"] as const;
type SelectionDirection = (typeof DIRECTIONS)[number];

export class HTMLInputElement extends HTMLElement {
  /** The value while the dirty value flag is set (value mode "value"). */
  [$value]: string;
  /** https://html.spec.whatwg.org/#concept-input-value-dirty-flag */
  [$dirtyValue]: boolean;
  /** Checkedness, authoritative only when `_checkedSet` (otherwise derived from the checked attribute). */
  [$checked]: boolean;
  [$checkedSet]: boolean;
  /** https://html.spec.whatwg.org/#concept-input-checked-dirty-flag */
  [$dirtyChecked]: boolean;
  [$indeterminate]: boolean;
  [$files]: FileList | null;
  [$selStart]: number;
  [$selEnd]: number;
  [$selDir]: SelectionDirection;
  [$customValidity]: string;
  [$validity]: ValidityState | null;
  [$labels]: LabelsNodeList | null;
  /** The value was last changed by a user edit (tooLong/tooShort only apply then). */
  [$userEdited]: boolean;
  /** The user typed something the type cannot represent (e.g. "1e" in a number field). */
  [$badInput]: boolean;
  /** User-event's UI value (raw typed text) — null when it equals the value. See ui.ts. */
  [$uiValue]: string | null;
  // Legacy-pre-activation state (https://html.spec.whatwg.org/#legacy-pre-activation-behavior).
  [$preChecked]: boolean;
  [$preIndeterminate]: boolean;
  [$preCheckedRadio]: NodeImpl | null;
  /** Legacy-pre-activation ran (and changed state) for the current dispatch. */
  [$preApplied]: boolean;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_ATTR_HOOK | F_CONNECT_HOOK;
    this[$value] = "";
    this[$dirtyValue] = false;
    this[$checked] = false;
    this[$checkedSet] = false;
    this[$dirtyChecked] = false;
    this[$indeterminate] = false;
    this[$files] = null;
    this[$selStart] = 0;
    this[$selEnd] = 0;
    this[$selDir] = "none";
    this[$customValidity] = "";
    this[$validity] = null;
    this[$labels] = null;
    this[$userEdited] = false;
    this[$badInput] = false;
    this[$uiValue] = null;
    this[$preChecked] = false;
    this[$preIndeterminate] = false;
    this[$preCheckedRadio] = null;
    this[$preApplied] = false;
  }

  // --- type ---------------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-input-type */
  get type(): string {
    return INPUT_TYPE_NAMES[inputType(this[$impl])];
  }

  set type(value: string) {
    setAttribute(this[$impl], "type", String(value));
  }

  // --- value ------------------------------------------------------------------------------------

  /** The element's value (https://html.spec.whatwg.org/#concept-fe-value) for value mode "value". */
  _currentValue(type: number): string {
    if (this[$dirtyValue]) return this[$value];
    return sanitizeValue(type, attr(this[$impl], "value") ?? "", this[$impl]);
  }

  /** https://html.spec.whatwg.org/#dom-input-value */
  get value(): string {
    const impl = this[$impl];
    const type = inputType(impl);
    switch (valueMode(type)) {
      case MODE_VALUE:
        return this._currentValue(type);
      case MODE_DEFAULT:
        return attr(impl, "value") ?? "";
      case MODE_DEFAULT_ON:
        return attr(impl, "value") ?? "on";
    }
    const files = this[$files];
    return files === null || files.length === 0 ? "" : "C:\\fakepath\\" + files.item(0)!.name;
  }

  set value(v: string) {
    const value = v === null ? "" : String(v); // [LegacyNullToEmptyString]
    const impl = this[$impl];
    const type = inputType(impl);
    switch (valueMode(type)) {
      case MODE_VALUE:
        this._setValueFromAPI(type, value);
        return;
      case MODE_DEFAULT:
      case MODE_DEFAULT_ON:
        setAttribute(impl, "value", value);
        return;
    }
    if (value !== "") {
      throw new DOMException(
        "Failed to set the 'value' property on 'HTMLInputElement': This input element accepts a filename, which may only be programmatically set to the empty string.",
        "InvalidStateError",
      );
    }
    this[$files] = null;
  }

  /** Value-mode setter steps (script assignment): https://html.spec.whatwg.org/#dom-input-value-value */
  _setValueFromAPI(type: number, value: string): void {
    const old = this._currentValue(type);
    this[$impl].doc[$version]++;
    this[$value] = sanitizeValue(type, value, this[$impl]);
    this[$dirtyValue] = true;
    this[$userEdited] = false;
    this[$badInput] = false;
    this[$uiValue] = null;
    if (this[$value] !== old) {
      // Move the text entry cursor to the end, unselecting, direction none.
      const len = this[$value].length;
      this[$selStart] = len;
      this[$selEnd] = len;
      this[$selDir] = "none";
    }
  }

  // --- checkedness ----------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#concept-fe-checked */
  _checkedness(): boolean {
    return this[$checkedSet] ? this[$checked] : attr(this[$impl], "checked") !== null;
  }

  /** Set checkedness; when it becomes true on a radio, uncheck the rest of its group. */
  _setCheckedness(value: boolean, dirty: boolean): void {
    // State that selectors (:checked), collections and aria caches observe: bump the version.
    this[$impl].doc[$version]++;
    this[$checked] = value;
    this[$checkedSet] = true;
    if (dirty) this[$dirtyChecked] = true;
    if (value && inputType(this[$impl]) === I_RADIO) uncheckOtherRadios(this[$impl]);
  }

  /** https://html.spec.whatwg.org/#dom-input-checked */
  get checked(): boolean {
    return this._checkedness();
  }

  set checked(value: boolean) {
    this._setCheckedness(!!value, true);
  }

  /** https://html.spec.whatwg.org/#dom-input-indeterminate */
  get indeterminate(): boolean {
    return this[$indeterminate];
  }

  set indeterminate(value: boolean) {
    this[$impl].doc[$version]++;
    this[$indeterminate] = !!value;
  }

  // --- files ----------------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-input-files */
  get files(): FileList | null {
    if (inputType(this[$impl]) !== I_FILE) return null;
    return (this[$files] ??= createFileList([]));
  }

  set files(value: FileList | null) {
    if (inputType(this[$impl]) !== I_FILE || value === null || value === undefined) return;
    this[$files] = toFileList(value);
  }

  // --- numbers and dates ----------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-input-valueasnumber */
  get valueAsNumber(): number {
    const type = inputType(this[$impl]);
    if (!isNumericType(type)) return NaN;
    return stringToNumber(type, this._currentValue(type));
  }

  set valueAsNumber(v: number) {
    const n = Number(v);
    if (!Number.isFinite(n) && !Number.isNaN(n)) {
      throw new TypeError("Failed to set the 'valueAsNumber' property on 'HTMLInputElement': The value provided is infinite.");
    }
    const type = inputType(this[$impl]);
    if (!isNumericType(type)) {
      throw new DOMException(
        "Failed to set the 'valueAsNumber' property on 'HTMLInputElement': This input element does not support Number values.",
        "InvalidStateError",
      );
    }
    this._setValueFromAPI(type, Number.isNaN(n) ? "" : numberToString(type, n));
  }

  /** https://html.spec.whatwg.org/#dom-input-valueasdate */
  get valueAsDate(): Date | null {
    const type = inputType(this[$impl]);
    if (type !== I_DATE && type !== I_MONTH && type !== I_WEEK && type !== I_TIME) return null;
    const n = stringToNumber(type, this._currentValue(type));
    if (Number.isNaN(n)) return null;
    if (type === I_MONTH) return new Date(utcMs(1970 + Math.floor(n / 12), (((n % 12) + 12) % 12) + 1));
    return new Date(n);
  }

  set valueAsDate(v: Date | null) {
    const type = inputType(this[$impl]);
    if (type !== I_DATE && type !== I_MONTH && type !== I_WEEK && type !== I_TIME) {
      throw new DOMException(
        "Failed to set the 'valueAsDate' property on 'HTMLInputElement': This input element does not support Date values.",
        "InvalidStateError",
      );
    }
    if (v === null) {
      this._setValueFromAPI(type, "");
      return;
    }
    // WebIDL `object?` + "if the given value is not a Date object, throw": a brand check
    // (Date.prototype.getTime throws for non-Dates), so Dates from other realms work too.
    let ms: number;
    try {
      ms = Date.prototype.getTime.call(v);
    } catch {
      throw new TypeError("Failed to set the 'valueAsDate' property on 'HTMLInputElement': The provided value is not a Date.");
    }
    if (Number.isNaN(ms)) {
      this._setValueFromAPI(type, "");
      return;
    }
    let n = ms;
    if (type === I_MONTH) {
      const d = new Date(ms);
      n = (d.getUTCFullYear() - 1970) * 12 + d.getUTCMonth();
    }
    this._setValueFromAPI(type, numberToString(type, n));
  }

  /** https://html.spec.whatwg.org/#dom-input-stepup */
  stepUp(n = 1): void {
    this._stepUpOrDown(Number(n) | 0, true);
  }

  /** https://html.spec.whatwg.org/#dom-input-stepdown */
  stepDown(n = 1): void {
    this._stepUpOrDown(Number(n) | 0, false);
  }

  _stepUpOrDown(n: number, up: boolean): void {
    const impl = this[$impl];
    const type = inputType(impl);
    const method = up ? "stepUp" : "stepDown";
    // Step 1: stepUp/stepDown do not apply.
    if (!isNumericType(type)) {
      throw new DOMException(`Failed to execute '${method}' on 'HTMLInputElement': This form element is not steppable.`, "InvalidStateError");
    }
    // Step 2: no allowed value step.
    const step = allowedStep(type, impl);
    if (Number.isNaN(step)) {
      throw new DOMException(`Failed to execute '${method}' on 'HTMLInputElement': This form element does not have an allowed value step.`, "InvalidStateError");
    }
    const min = minimum(type, impl);
    const max = maximum(type, impl);
    // Step 3: min > max → return.
    if (!Number.isNaN(min) && !Number.isNaN(max) && min > max) return;
    const base = stepBase(type, impl);
    // Step 4: no value in [min, max] matches the step → return.
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      const first = base + Math.ceil((min - base) / step - 1e-9) * step;
      if (first > max + 1e-9) return;
    }
    // Step 5–6.
    let value = stringToNumber(type, this._currentValue(type));
    const hadValue = !Number.isNaN(value);
    if (!hadValue) value = 0;
    const before = value;
    // Step 7.
    const k = (value - base) / step;
    if (!isIntegral(k)) {
      value = base + (up ? Math.ceil(k) : Math.floor(k)) * step;
    } else {
      value += (up ? n : -n) * step;
    }
    value = roundForStep(value, step, base);
    // Step 8: clamp onto the range, staying on a step.
    if (!Number.isNaN(min) && value < min) value = roundForStep(base + Math.ceil((min - base) / step - 1e-9) * step, step, base);
    else if (!Number.isNaN(max) && value > max) value = roundForStep(base + Math.floor((max - base) / step + 1e-9) * step, step, base);
    // Step 9 — only guards a value that was there: stepDown() on an empty input with min=7
    // yields "7" in browsers (WPT input-stepdown-02.html).
    if (hadValue && ((up && value < before) || (!up && value > before))) return;
    // Step 10.
    this._setValueFromAPI(type, numberToString(type, value));
  }

  // --- selection ---------------------------------------------------------------------------

  _selectionLength(): number {
    return this.value.length;
  }

  _assertSelectable(member: string): void {
    if (!supportsSelectionType(inputType(this[$impl]))) {
      throw new DOMException(
        `Failed to ${member.endsWith(")") ? "execute" : "set"} '${member.replace("()", "")}' on 'HTMLInputElement': The input element's type ('${this.type}') does not support selection.`,
        "InvalidStateError",
      );
    }
  }

  /** https://html.spec.whatwg.org/#dom-textarea/input-selectionstart */
  get selectionStart(): number | null {
    if (!supportsSelectionType(inputType(this[$impl]))) return null;
    return Math.min(this[$selStart], this._selectionLength());
  }

  set selectionStart(value: number | null) {
    this._assertSelectable("selectionStart");
    const start = toUnsignedLong(value);
    const end = Math.max(start, this.selectionEnd!);
    setSelection(this, start, end, this[$selDir]);
  }

  get selectionEnd(): number | null {
    if (!supportsSelectionType(inputType(this[$impl]))) return null;
    return Math.min(this[$selEnd], this._selectionLength());
  }

  set selectionEnd(value: number | null) {
    this._assertSelectable("selectionEnd");
    setSelection(this, this.selectionStart!, toUnsignedLong(value), this[$selDir]);
  }

  get selectionDirection(): string | null {
    if (!supportsSelectionType(inputType(this[$impl]))) return null;
    return this[$selDir];
  }

  set selectionDirection(value: string | null) {
    this._assertSelectable("selectionDirection");
    setSelection(this, this.selectionStart!, this.selectionEnd!, String(value));
  }

  /** https://html.spec.whatwg.org/#dom-textarea/input-setselectionrange */
  setSelectionRange(start: number, end: number, direction?: string): void {
    this._assertSelectable("setSelectionRange()");
    setSelection(this, toUnsignedLong(start), toUnsignedLong(end), direction === undefined ? "none" : String(direction));
  }

  /** https://html.spec.whatwg.org/#dom-textarea/input-select */
  select(): void {
    const type = inputType(this[$impl]);
    if (!selectApplies(type)) return;
    // Types without the selection APIs (email, number, ...) still track the selection internally.
    setSelection(this, 0, this._selectionLength(), "none");
  }

  /** https://html.spec.whatwg.org/#dom-textarea/input-setrangetext */
  setRangeText(replacement: string, start?: number, end?: number, selectionMode?: string): void {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'setRangeText' on 'HTMLInputElement': 1 argument required, but only 0 present.");
    this._assertSelectable("setRangeText()");
    const result = rangeText(this.value, this[$selStart], this[$selEnd], String(replacement), start, end, selectionMode, arguments.length);
    const type = inputType(this[$impl]);
    this[$impl].doc[$version]++;
    this[$value] = sanitizeValue(type, result.value, this[$impl]);
    this[$dirtyValue] = true;
    this[$uiValue] = null;
    setSelection(this, result.start, result.end, "none");
  }

  // --- reflected attributes (installed below with src/html/reflect.ts) ------------------------

  declare accept: string;
  declare alt: string;
  declare autocomplete: string;
  declare dirName: string;
  declare disabled: boolean;
  declare formEnctype: string;
  declare formMethod: string;
  declare formNoValidate: boolean;
  declare formTarget: string;
  /**
   * https://html.spec.whatwg.org/#dom-input-height — the rendered height when rendered (never,
   * without layout), else the natural height of an available image (never fetched), else the
   * attribute's value as a non-negative integer, else 0.
   */
  get height(): number {
    return dimensionAttr(this[$impl], "height");
  }
  set height(v: number) {
    const n = toUnsignedLong(v);
    setAttribute(this[$impl], "height", String(n <= 2147483647 ? n : 0));
  }
  /** https://html.spec.whatwg.org/#dom-input-width — see `height`. */
  get width(): number {
    return dimensionAttr(this[$impl], "width");
  }
  set width(v: number) {
    const n = toUnsignedLong(v);
    setAttribute(this[$impl], "width", String(n <= 2147483647 ? n : 0));
  }
  declare max: string;
  declare maxLength: number;
  declare min: string;
  declare minLength: number;
  declare multiple: boolean;
  declare name: string;
  declare pattern: string;
  declare placeholder: string;
  declare readOnly: boolean;
  declare required: boolean;
  declare size: number;
  declare src: string;
  declare step: string;
  declare useMap: string;
  declare align: string;
  declare defaultChecked: boolean;
  declare defaultValue: string;

  /** https://html.spec.whatwg.org/#dom-fs-formaction */
  get formAction(): string {
    return reflectActionURL(this[$impl], "formaction");
  }
  set formAction(v: string) {
    setAttribute(this[$impl], "formaction", String(v));
  }

  /** https://html.spec.whatwg.org/#dom-input-list */
  get list(): Element | null {
    const impl = this[$impl];
    if (!listApplies(inputType(impl))) return null;
    const id = attr(impl, "list");
    if (id === null) return null;
    const target = elementByIdInTree(impl, id);
    return target !== null && target.tag === T.datalist ? (target.node as Element) : null;
  }

  /** https://html.spec.whatwg.org/#dom-fae-form */
  get form(): Element | null {
    const owner = formOwner(this[$impl]);
    return owner === null ? null : (owner.node as Element);
  }

  /** https://html.spec.whatwg.org/#dom-lfe-labels */
  get labels(): LabelsNodeList | null {
    if (inputType(this[$impl]) === I_HIDDEN) return null;
    return (this[$labels] ??= new LabelsNodeList(this[$impl]));
  }

  /** https://html.spec.whatwg.org/#dom-input-showpicker — no picker UI here. */
  showPicker(): void {
    if (!this._isMutable()) {
      throw new DOMException("Failed to execute 'showPicker' on 'HTMLInputElement': HTMLInputElement::showPicker() cannot be used on immutable controls.", "InvalidStateError");
    }
  }

  // --- mutability / constraint validation -----------------------------------------------------

  /** https://html.spec.whatwg.org/#concept-fe-mutable */
  _isMutable(): boolean {
    const impl = this[$impl];
    if (isActuallyDisabled(impl)) return false;
    return !(readonlyApplies(inputType(impl)) && attr(impl, "readonly") !== null);
  }

  _barredFromValidation(): boolean {
    const impl = this[$impl];
    const type = inputType(impl);
    if (type === I_HIDDEN || type === I_RESET || type === I_BUTTON) return true;
    // https://html.spec.whatwg.org/#the-readonly-attribute:barred-from-constraint-validation
    // bars every input with a readonly attribute; like jsdom we only bar the types readonly
    // applies to, so a controlled `<input type=checkbox readOnly required>` (React's suggested
    // fix for a checked prop without onChange) still validates. docs/deviations.md.
    if (readonlyApplies(type) && attr(impl, "readonly") !== null) return true;
    return isActuallyDisabled(impl) || hasDatalistAncestor(impl);
  }

  _validityFlags(): number {
    const impl = this[$impl];
    const type = inputType(impl);
    let flags = this[$customValidity] === "" ? 0 : V_CUSTOM_ERROR;
    const mode = valueMode(type);
    // valueMissing
    if (requiredApplies(type) && attr(impl, "required") !== null) {
      if (type === I_CHECKBOX) {
        if (!this._checkedness()) flags |= V_VALUE_MISSING;
      } else if (type === I_RADIO) {
        if (radioGroupMissing(impl)) flags |= V_VALUE_MISSING;
      } else if (type === I_FILE) {
        if (this[$files] === null || this[$files].length === 0) flags |= V_VALUE_MISSING;
      } else if (mode === MODE_VALUE && this._isMutable() && this._currentValue(type) === "") {
        flags |= V_VALUE_MISSING;
      }
    } else if (type === I_RADIO && radioGroupMissing(impl)) {
      // Any required member of the group makes the whole group suffer from being missing.
      flags |= V_VALUE_MISSING;
    }
    if (mode !== MODE_VALUE) return flags;
    const value = this._currentValue(type);
    if (this[$badInput]) flags |= V_BAD_INPUT;
    if (value === "") return flags;
    // typeMismatch
    if (type === I_EMAIL) {
      if (attr(impl, "multiple") !== null) {
        const parts = value.split(",");
        for (let i = 0; i < parts.length; i++) {
          if (!isValidEmail(parts[i])) {
            flags |= V_TYPE_MISMATCH;
            break;
          }
        }
      } else if (!isValidEmail(value)) flags |= V_TYPE_MISMATCH;
    } else if (type === I_URL && !isValidAbsoluteURL(value)) flags |= V_TYPE_MISMATCH;
    if (lengthApplies(type)) {
      // patternMismatch: https://html.spec.whatwg.org/#attr-input-pattern
      const pattern = attr(impl, "pattern");
      if (pattern !== null) {
        const re = compilePattern(pattern);
        if (re !== null) {
          if (type === I_EMAIL && attr(impl, "multiple") !== null) {
            const parts = value.split(",");
            for (let i = 0; i < parts.length; i++) {
              if (!re.test(parts[i])) {
                flags |= V_PATTERN_MISMATCH;
                break;
              }
            }
          } else if (!re.test(value)) flags |= V_PATTERN_MISMATCH;
        }
      }
      // tooLong / tooShort: only after a user edit.
      if (this[$userEdited]) {
        const max = readNonNegativeLong(impl, "maxlength", -1);
        if (max !== -1 && value.length > max) flags |= V_TOO_LONG;
        const min = readNonNegativeLong(impl, "minlength", -1);
        if (min !== -1 && value.length < min) flags |= V_TOO_SHORT;
      }
    }
    if (isNumericType(type)) {
      const n = stringToNumber(type, value);
      if (!Number.isNaN(n)) {
        const min = minimum(type, impl);
        const max = maximum(type, impl);
        if (type === I_TIME && !Number.isNaN(min) && !Number.isNaN(max) && min > max) {
          // Reversed range (https://html.spec.whatwg.org/#has-a-reversed-range).
          if (n < min && n > max) flags |= V_RANGE_UNDERFLOW | V_RANGE_OVERFLOW;
        } else {
          if (!Number.isNaN(min) && n < min) flags |= V_RANGE_UNDERFLOW;
          if (!Number.isNaN(max) && n > max) flags |= V_RANGE_OVERFLOW;
        }
        const step = allowedStep(type, impl);
        if (!Number.isNaN(step) && !isStepAligned(n, stepBase(type, impl), step)) flags |= V_STEP_MISMATCH;
      }
    }
    return flags;
  }

  _validationMessage(flags: number): string {
    const impl = this[$impl];
    const type = inputType(impl);
    if ((flags & V_VALUE_MISSING) !== 0) {
      if (type === I_CHECKBOX) return MSG_CHECKBOX;
      if (type === I_RADIO) return MSG_RADIO;
      if (type === I_FILE) return MSG_FILE;
      return MSG_FILL_OUT;
    }
    if ((flags & V_BAD_INPUT) !== 0) return type === I_NUMBER ? MSG_NUMBER : MSG_BAD_INPUT;
    const value = this._currentValue(type);
    if ((flags & V_TYPE_MISMATCH) !== 0) return type === I_EMAIL ? msgEmail(value) : MSG_URL;
    if ((flags & V_PATTERN_MISMATCH) !== 0) return MSG_PATTERN;
    if ((flags & V_TOO_LONG) !== 0) return msgTooLong(this.maxLength, value.length);
    if ((flags & V_TOO_SHORT) !== 0) return msgTooShort(this.minLength, value.length);
    const isDate = type !== I_NUMBER && type !== I_RANGE;
    if ((flags & V_RANGE_UNDERFLOW) !== 0) return msgUnderflow(numberToString(type, minimum(type, impl)), isDate);
    if ((flags & V_RANGE_OVERFLOW) !== 0) return msgOverflow(numberToString(type, maximum(type, impl)), isDate);
    if ((flags & V_STEP_MISMATCH) !== 0) {
      const n = stringToNumber(type, value);
      const step = allowedStep(type, impl);
      const base = stepBase(type, impl);
      const lowN = roundForStep(base + Math.floor((n - base) / step) * step, step, base);
      const highN = roundForStep(lowN + step, step, base);
      const min = minimum(type, impl);
      const max = maximum(type, impl);
      const low = !Number.isNaN(min) && lowN < min ? null : numberToString(type, lowN);
      const high = !Number.isNaN(max) && highN > max ? null : numberToString(type, highN);
      return msgStep(low, high);
    }
    return this[$customValidity];
  }

  // --- algorithms --------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#the-input-element:concept-form-reset-control */
  _reset(): void {
    this[$dirtyValue] = false;
    this[$dirtyChecked] = false;
    this[$userEdited] = false;
    this[$badInput] = false;
    this[$uiValue] = null;
    this[$value] = "";
    this[$files] = null;
    this._setCheckedness(attr(this[$impl], "checked") !== null, false);
  }

  /** Hook: attribute change steps (type change, value/checked content attribute, radio group). */
  override _attributeChangedSteps(localName: string, oldValue: string | null, value: string | null, namespace: string | null): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    if (namespace !== null) return;
    switch (localName) {
      case "type": {
        const oldType = inputTypeFromAttr(oldValue);
        const newType = inputTypeFromAttr(value);
        if (oldType !== newType) this._typeChange(oldType, newType);
        break;
      }
      case "checked":
        // https://html.spec.whatwg.org/#the-input-element:concept-input-checked-dirty-flag-2
        if (!this[$dirtyChecked]) this._setCheckedness(value !== null, false);
        break;
      case "name":
      case "form":
        if (inputType(this[$impl]) === I_RADIO && this._checkedness()) uncheckOtherRadios(this[$impl]);
        break;
      case "multiple":
        // https://html.spec.whatwg.org/#email-state-(type=email): "When the multiple attribute
        // is set or removed, the user agent must run the value sanitization algorithm."
        if (this[$dirtyValue] && inputType(this[$impl]) === I_EMAIL) this[$value] = sanitizeValue(I_EMAIL, this[$value], this[$impl]);
        break;
      case "value": {
        // With the dirty value flag unset the value follows the attribute (derived on read);
        // keep the selection inside it.
        break;
      }
    }
  }

  /** https://html.spec.whatwg.org/#input-type-change */
  _typeChange(oldType: number, newType: number): void {
    const impl = this[$impl];
    const oldMode = valueMode(oldType);
    const newMode = valueMode(newType);
    if (oldMode === MODE_VALUE && (newMode === MODE_DEFAULT || newMode === MODE_DEFAULT_ON)) {
      // Step 1: carry the value over into the value content attribute.
      const v = this[$dirtyValue] ? this[$value] : sanitizeValue(oldType, attr(impl, "value") ?? "", impl);
      this[$dirtyValue] = false;
      if (v !== "") setAttribute(impl, "value", v);
    } else if (oldMode !== MODE_VALUE && newMode === MODE_VALUE) {
      // Step 2: value from the content attribute, dirty flag false.
      this[$dirtyValue] = false;
      this[$value] = "";
    } else if (oldMode !== MODE_FILENAME && newMode === MODE_FILENAME) {
      // Step 3.
      this[$dirtyValue] = false;
      this[$value] = "";
    }
    if (oldMode === MODE_FILENAME && newMode !== MODE_FILENAME) this[$files] = null;
    // Step 5: radio group membership changed.
    if (newType === I_RADIO && this._checkedness()) uncheckOtherRadios(impl);
    // Step 6: value sanitization.
    if (newMode === MODE_VALUE && this[$dirtyValue]) this[$value] = sanitizeValue(newType, this[$value], impl);
    this[$uiValue] = null;
    this[$badInput] = false;
    // Step 7: selection becomes applicable → reset it.
    if (!supportsSelectionType(oldType) && supportsSelectionType(newType)) {
      this[$selStart] = 0;
      this[$selEnd] = 0;
      this[$selDir] = "none";
    }
  }

  /** Insertion steps (connected case): radio group rule on insertion. */
  override _connectedSteps(): void {
    super._connectedSteps();
    if (inputType(this[$impl]) === I_RADIO && this._checkedness()) uncheckOtherRadios(this[$impl]);
  }

  /** https://html.spec.whatwg.org/#the-input-element:concept-node-clone-ext */
  override _cloningSteps(copy: Element): void {
    const c = copy as HTMLInputElement;
    c[$value] = this[$value];
    c[$dirtyValue] = this[$dirtyValue];
    c[$checked] = this._checkedness();
    c[$checkedSet] = true;
    c[$dirtyChecked] = this[$dirtyChecked];
    c[$indeterminate] = this[$indeterminate];
  }

  // --- activation behavior (called by the events agent's dispatch algorithm) ------------------
  // https://html.spec.whatwg.org/#the-input-element:activation-behaviour
  // TODO(events): dispatch must call _legacyPreActivationBehavior / _legacyCanceledActivationBehavior /
  // _activationBehavior on the activation target (https://dom.spec.whatwg.org/#concept-event-dispatch steps 11–13).

  /**
   * "An input element has activation behavior if its type attribute's state defines input
   * activation behavior" (https://html.spec.whatwg.org/#the-input-element:activation-behaviour):
   * checkbox, radio, the buttons, file and color. Others (hidden, text, ...) leave the click to an
   * ancestor such as a <label> (WPT clicking-noninteractive-unlabelable-content.html).
   */
  get _hasActivationBehavior(): boolean {
    switch (inputType(this[$impl])) {
      case I_CHECKBOX:
      case I_RADIO:
      case I_SUBMIT:
      case I_IMAGE:
      case I_RESET:
      case I_BUTTON:
      case I_FILE:
      case I_COLOR:
        return true;
    }
    return false;
  }

  /** https://html.spec.whatwg.org/#the-input-element:legacy-pre-activation-behavior */
  _legacyPreActivationBehavior(): void {
    const impl = this[$impl];
    const type = inputType(impl);
    this[$preApplied] = false;
    // Disabled controls: user interaction never dispatches clicks to them (HTMLElement.click()
    // and user-event filter), but a script-dispatched click still activates them.
    if (type === I_CHECKBOX) {
      this[$preApplied] = true;
      this[$preChecked] = this._checkedness();
      this[$preIndeterminate] = this[$indeterminate];
      this._setCheckedness(!this[$preChecked], true);
      this[$indeterminate] = false;
    } else if (type === I_RADIO) {
      this[$preApplied] = true;
      this[$preChecked] = this._checkedness();
      this[$preCheckedRadio] = checkedRadioInGroup(impl);
      this._setCheckedness(true, true);
    }
  }

  /** https://html.spec.whatwg.org/#the-input-element:legacy-canceled-activation-behavior */
  _legacyCanceledActivationBehavior(): void {
    if (!this[$preApplied]) return;
    this[$preApplied] = false;
    const impl = this[$impl];
    const type = inputType(impl);
    impl.doc[$version]++;
    if (type === I_CHECKBOX) {
      this[$checked] = this[$preChecked];
      this[$checkedSet] = true;
      this[$indeterminate] = this[$preIndeterminate];
    } else if (type === I_RADIO) {
      const prev = this[$preCheckedRadio];
      this[$preCheckedRadio] = null;
      if (prev !== null && prev !== impl && inSameRadioGroup(impl, prev)) {
        (prev.node as HTMLInputElement)._setCheckedness(true, false);
      } else if (prev !== impl) {
        this[$checked] = false;
        this[$checkedSet] = true;
      }
    }
  }

  /** https://html.spec.whatwg.org/#the-input-element:activation-behaviour */
  _activationBehavior(_event: Event | null): void {
    const impl = this[$impl];
    const type = inputType(impl);
    if (type === I_CHECKBOX || type === I_RADIO) {
      // https://html.spec.whatwg.org/#checkbox-state-(type=checkbox):input-activation-behavior
      if ((impl.flags & F_CONNECTED) === 0) return;
      if (type === I_RADIO && this[$preChecked]) return; // clicking a checked radio changes nothing
      fireEvent(this, "input", true, false, true);
      fireEvent(this, "change", true, false);
      return;
    }
    if (!this._isMutable()) return;
    if (type === I_SUBMIT || type === I_IMAGE) {
      const form = formOwner(impl);
      if (form !== null) submitForm(form, impl, false);
    } else if (type === I_RESET) {
      const form = formOwner(impl);
      if (form !== null && (impl.flags & F_CONNECTED) !== 0) resetForm(form);
    }
    // Step 3: https://html.spec.whatwg.org/#popover-target-attribute-activation-behavior (html/invokers.ts).
    popoverTargetAttributeActivation(impl, (_event?.target as unknown as { [$impl]?: NodeImpl } | null)?.[$impl] ?? null);
  }
}

export interface HTMLInputElement extends ConstraintValidation {}
installConstraintValidation(HTMLInputElement);

str(HTMLInputElement, "accept alt dirName=dirname formTarget=formtarget max min name pattern placeholder step useMap=usemap align defaultValue=value");
bool(HTMLInputElement, "disabled formNoValidate=formnovalidate multiple readOnly=readonly required defaultChecked=checked");
url(HTMLInputElement, "src");
ulong(HTMLInputElement, "size", 20, true);
nonNegativeLong(HTMLInputElement, "maxLength=maxlength minLength=minlength", -1);
enumerated(HTMLInputElement, "formEnctype=formenctype", FORM_ENCTYPE);
enumerated(HTMLInputElement, "formMethod=formmethod", FORM_METHOD);

/** An image button's width/height content attribute parsed with the rules for non-negative integers (0 on error). */
function dimensionAttr(impl: NodeImpl, name: string): number {
  // Only an image button has an image (other types read 0, as in jsdom).
  return inputType(impl) === I_IMAGE ? readNonNegativeLong(impl, name, 0) : 0;
}

/** select() applies: https://html.spec.whatwg.org/#do-not-apply */
function selectApplies(type: number): boolean {
  return (type >= I_TEXT && type <= I_NUMBER) || type === I_COLOR || type === I_FILE;
}

const patternCache = new Map<string, RegExp | null>();

/** https://html.spec.whatwg.org/#compiled-pattern-regular-expression — `^(?:pattern)$` with the v flag. */
function compilePattern(pattern: string): RegExp | null {
  let re = patternCache.get(pattern);
  if (re !== undefined) return re;
  try {
    // Step 1: the pattern must parse on its own, so "a)(b" cannot escape the wrapping group.
    new RegExp(pattern, "v");
    // Step 2.
    re = new RegExp("^(?:" + pattern + ")$", "v");
  } catch {
    re = null;
  }
  if (patternCache.size > 256) patternCache.clear();
  patternCache.set(pattern, re);
  return re;
}

// --- selection helpers (shared with textarea) ---------------------------------------------------

interface SelectionHost {
  [$selStart]: number;
  [$selEnd]: number;
  [$selDir]: SelectionDirection;
  _selectionLength(): number;
}

/**
 * https://html.spec.whatwg.org/#set-the-selection-range — when the selection changed, queue a
 * task to fire a bubbling `select` event at the element.
 */
export function setSelection(el: SelectionHost, start: number, end: number, direction: string): void {
  const len = el._selectionLength();
  if (end > len) end = len;
  if (start > end) start = end;
  const dir = direction === "forward" || direction === "backward" ? direction : "none";
  const changed = start !== Math.min(el[$selStart], len) || end !== Math.min(el[$selEnd], len) || dir !== el[$selDir];
  el[$selStart] = start;
  el[$selEnd] = end;
  el[$selDir] = dir;
  if (changed) {
    const target = el as unknown as EventTarget;
    queueTask(() => fireEvent(target, "select", true, false));
  }
}

/** The setRangeText() algorithm: https://html.spec.whatwg.org/#dom-textarea/input-setrangetext */
export function rangeText(
  value: string,
  selStart: number,
  selEnd: number,
  replacement: string,
  startArg: number | undefined,
  endArg: number | undefined,
  modeArg: string | undefined,
  argc: number,
): { value: string; start: number; end: number } {
  const len = value.length;
  selStart = Math.min(selStart, len);
  selEnd = Math.min(selEnd, len);
  let start: number;
  let end: number;
  if (argc < 2) {
    start = selStart;
    end = selEnd;
  } else {
    start = toUnsignedLong(startArg);
    end = toUnsignedLong(endArg);
  }
  if (start > end) {
    throw new DOMException(`Failed to execute 'setRangeText': The provided start value (${start}) is larger than the provided end value (${end}).`, "IndexSizeError");
  }
  if (start > len) start = len;
  if (end > len) end = len;
  const mode = modeArg === undefined ? "preserve" : String(modeArg);
  if (mode !== "select" && mode !== "start" && mode !== "end" && mode !== "preserve") {
    throw new TypeError(`Failed to execute 'setRangeText': The provided value '${mode}' is not a valid enum value of type SelectionMode.`);
  }
  const newValue = value.slice(0, start) + replacement + value.slice(end);
  const newEnd = start + replacement.length;
  let ns = selStart;
  let ne = selEnd;
  switch (mode) {
    case "select":
      ns = start;
      ne = newEnd;
      break;
    case "start":
      ns = ne = start;
      break;
    case "end":
      ns = ne = newEnd;
      break;
    default: {
      const delta = replacement.length - (end - start);
      if (ns > end) ns += delta;
      else if (ns > start) ns = start;
      if (ne > end) ne += delta;
      else if (ne > start) ne = newEnd;
    }
  }
  return { value: newValue, start: ns, end: ne };
}

// --- radio button groups -----------------------------------------------------------------------

/** https://html.spec.whatwg.org/#radio-button-group */
export function inSameRadioGroup(a: NodeImpl, b: NodeImpl): boolean {
  if (b.tag !== T.input || inputType(b) !== I_RADIO) return false;
  const name = attr(a, "name");
  if (name === null || name === "" || attr(b, "name") !== name) return false;
  if (treeRoot(a) !== treeRoot(b)) return false;
  return formOwner(a) === formOwner(b);
}

function forEachInRadioGroup(el: NodeImpl, fn: (other: NodeImpl) => boolean): void {
  const name = attr(el, "name");
  if (name === null || name === "") return;
  const owner = formOwner(el);
  // Elements whose form owner is a form can only be in that form's tree; scan its root.
  const root = treeRoot(owner ?? el);
  for (let n = root.type === ELEMENT_NODE ? root : nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
    if (n === el || n.tag !== T.input) continue;
    if (attr(n, "name") !== name || inputType(n) !== I_RADIO) continue;
    if (formOwner(n) !== owner) continue;
    if (fn(n)) return;
  }
}

/** Set checkedness false on every other member of el's radio button group. */
export function uncheckOtherRadios(el: NodeImpl): void {
  forEachInRadioGroup(el, (other) => {
    const w = other.node as HTMLInputElement;
    if (w[$checkedSet] && !w[$checked]) return false;
    other.doc[$version]++;
    w[$checked] = false;
    w[$checkedSet] = true;
    return false;
  });
}

function checkedRadioInGroup(el: NodeImpl): NodeImpl | null {
  if ((el.node as HTMLInputElement)._checkedness()) return el;
  let found: NodeImpl | null = null;
  forEachInRadioGroup(el, (other) => {
    if ((other.node as HTMLInputElement)._checkedness()) {
      found = other;
      return true;
    }
    return false;
  });
  return found;
}

/** Radio valueMissing: some member is required and no member is checked. */
function radioGroupMissing(el: NodeImpl): boolean {
  const self = el.node as HTMLInputElement;
  if (self._checkedness()) return false;
  // A radio without a (non-empty) name is in no radio button group
  // (https://html.spec.whatwg.org/#radio-button-group), so nothing makes it missing (as in
  // browsers; WPT form-validation-validity-valueMissing.html).
  const name = attr(el, "name");
  if (name === null || name === "") return false;
  let required = attr(el, "required") !== null;
  let checked = false;
  forEachInRadioGroup(el, (other) => {
    if ((other.node as HTMLInputElement)._checkedness()) {
      checked = true;
      return true;
    }
    if (attr(other, "required") !== null) required = true;
    return false;
  });
  return required && !checked;
}

/** Whether `el` (a radio) has no checked member in its group — `:indeterminate` for radios. */
export function radioGroupHasNoChecked(el: NodeImpl): boolean {
  return checkedRadioInGroup(el) === null;
}
installAutocomplete(HTMLInputElement);
