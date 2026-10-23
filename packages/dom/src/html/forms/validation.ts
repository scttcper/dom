// The constraint validation API: https://html.spec.whatwg.org/#the-constraint-validation-api
//
// Each validatable element class implements `_validityFlags()` (a bit set of V_* flags,
// computed on demand from current state) and `_barredFromValidation()`; this module provides
// ValidityState and the shared willValidate/validity/validationMessage/checkValidity/
// reportValidity/setCustomValidity members, installed onto each prototype like the DOM
// interface mixins (see nodes/mixins.ts).

import { exposeMembers, hideInternals } from "../../webidl-runtime.ts";
import type { Element } from "../../nodes/Element.ts";
import { fireEvent, normalizeNewlines } from "./common.ts";
import { $customValidity, $el, $impl, $options, $validity, $window } from "../../keys.ts";

export const V_VALUE_MISSING = 1 << 0;
export const V_TYPE_MISMATCH = 1 << 1;
export const V_PATTERN_MISMATCH = 1 << 2;
export const V_TOO_LONG = 1 << 3;
export const V_TOO_SHORT = 1 << 4;
export const V_RANGE_UNDERFLOW = 1 << 5;
export const V_RANGE_OVERFLOW = 1 << 6;
export const V_STEP_MISMATCH = 1 << 7;
export const V_BAD_INPUT = 1 << 8;
export const V_CUSTOM_ERROR = 1 << 9;

/** Internal contract every element with the constraint validation API implements. */
export interface Validatable extends Element {
  [$customValidity]: string;
  [$validity]: ValidityState | null;
  /** Bit set of V_* flags describing the current validity state. */
  _validityFlags(): number;
  /** https://html.spec.whatwg.org/#barred-from-constraint-validation */
  _barredFromValidation(): boolean;
  /** Browser-like message for the first failing constraint in `flags` (customError excluded). */
  _validationMessage(flags: number): string;
}

/** https://html.spec.whatwg.org/#validitystate */
export class ValidityState {
  [$el]: Validatable;

  /** @internal */
  constructor(el: Validatable) {
    this[$el] = el;
    hideInternals(this);
  }

  get valueMissing(): boolean {
    return (this[$el]._validityFlags() & V_VALUE_MISSING) !== 0;
  }
  get typeMismatch(): boolean {
    return (this[$el]._validityFlags() & V_TYPE_MISMATCH) !== 0;
  }
  get patternMismatch(): boolean {
    return (this[$el]._validityFlags() & V_PATTERN_MISMATCH) !== 0;
  }
  get tooLong(): boolean {
    return (this[$el]._validityFlags() & V_TOO_LONG) !== 0;
  }
  get tooShort(): boolean {
    return (this[$el]._validityFlags() & V_TOO_SHORT) !== 0;
  }
  get rangeUnderflow(): boolean {
    return (this[$el]._validityFlags() & V_RANGE_UNDERFLOW) !== 0;
  }
  get rangeOverflow(): boolean {
    return (this[$el]._validityFlags() & V_RANGE_OVERFLOW) !== 0;
  }
  get stepMismatch(): boolean {
    return (this[$el]._validityFlags() & V_STEP_MISMATCH) !== 0;
  }
  get badInput(): boolean {
    return (this[$el]._validityFlags() & V_BAD_INPUT) !== 0;
  }
  get customError(): boolean {
    return (this[$el]._validityFlags() & V_CUSTOM_ERROR) !== 0;
  }
  get valid(): boolean {
    return this[$el]._validityFlags() === 0;
  }

  get [Symbol.toStringTag](): string {
    return "ValidityState";
  }
}
exposeMembers(ValidityState);

/** The element is a candidate for constraint validation and does not satisfy its constraints. */
export function isInvalidCandidate(el: Validatable): boolean {
  return !el._barredFromValidation() && el._validityFlags() !== 0;
}

/**
 * https://html.spec.whatwg.org/#check-validity-steps — fires `invalid` (cancelable) when the
 * element is an invalid candidate. Returns validity.
 */
export function checkValidityOf(el: Validatable): boolean {
  if (!isInvalidCandidate(el)) return true;
  fireEvent(el, "invalid", false, true);
  return false;
}

export interface ConstraintValidation {
  readonly willValidate: boolean;
  readonly validity: ValidityState;
  readonly validationMessage: string;
  checkValidity(): boolean;
  reportValidity(): boolean;
  setCustomValidity(error: string): void;
}

const constraintValidation = {
  /** https://html.spec.whatwg.org/#dom-cva-willvalidate */
  get willValidate(): boolean {
    return !(this as unknown as Validatable)._barredFromValidation();
  },

  /** https://html.spec.whatwg.org/#dom-cva-validity */
  get validity(): ValidityState {
    const el = this as unknown as Validatable;
    return (el[$validity] ??= new ValidityState(el));
  },

  /** https://html.spec.whatwg.org/#dom-cva-validationmessage */
  get validationMessage(): string {
    const el = this as unknown as Validatable;
    if (el._barredFromValidation()) return "";
    const flags = el._validityFlags();
    if (flags === 0) return "";
    // The custom validity error message takes precedence whenever customError is set
    // (Chromium and jsdom behave the same).
    if ((flags & V_CUSTOM_ERROR) !== 0) return el[$customValidity];
    return builtinMessage(el, flags);
  },

  /** https://html.spec.whatwg.org/#dom-cva-checkvalidity */
  checkValidity(): boolean {
    return checkValidityOf(this as unknown as Validatable);
  },

  /**
   * https://html.spec.whatwg.org/#dom-cva-reportvalidity — like checkValidity; there is no UI
   * to report problems to.
   */
  reportValidity(): boolean {
    return checkValidityOf(this as unknown as Validatable);
  },

  /** https://html.spec.whatwg.org/#dom-cva-setcustomvalidity */
  setCustomValidity(error: string): void {
    (this as unknown as Validatable)[$customValidity] = normalizeNewlines(String(error));
  },
};

export function installConstraintValidation(target: { prototype: object }): void {
  for (const key of Reflect.ownKeys(constraintValidation)) {
    Object.defineProperty(target.prototype, key, Object.getOwnPropertyDescriptor(constraintValidation, key)!);
  }
}

/** jsdom's text for every built-in constraint failure (the default; drop-in compatibility). */
export const MSG_JSDOM = "Constraints not satisfied";

/**
 * The message for built-in failures: jsdom's generic text unless the window was created with
 * `validationMessages: "browser"` (docs/deviations.md).
 */
function builtinMessage(el: Validatable, flags: number): string {
  const win = el[$impl].doc[$window] as unknown as { [$options]?: { validationMessages?: string } } | null;
  return win?.[$options]?.validationMessages === "browser" ? el._validationMessage(flags) : MSG_JSDOM;
}

// --- browser-like messages (Chromium en-US wording) -----------------------------------------

export const MSG_FILL_OUT = "Please fill out this field.";
export const MSG_CHECKBOX = "Please check this box if you want to proceed.";
export const MSG_RADIO = "Please select one of these options.";
export const MSG_SELECT = "Please select an item in the list.";
export const MSG_FILE = "Please select a file.";
export const MSG_PATTERN = "Please match the requested format.";
export const MSG_URL = "Please enter a URL.";
export const MSG_NUMBER = "Please enter a number.";
export const MSG_BAD_INPUT = "Please enter a valid value.";

export function msgEmail(value: string): string {
  const at = value.indexOf("@");
  if (at === -1) return `Please include an '@' in the email address. '${value}' is missing an '@'.`;
  if (at === value.length - 1) return `Please enter a part following '@'. '${value}' is incomplete.`;
  if (at === 0) return `Please enter a part followed by '@'. '${value}' is incomplete.`;
  return "Please enter an email address.";
}

function characters(n: number): string {
  return n === 1 ? "1 character" : `${n} characters`;
}

export function msgTooLong(max: number, len: number): string {
  return `Please shorten this text to ${characters(max)} or less (you are currently using ${characters(len)}).`;
}

export function msgTooShort(min: number, len: number): string {
  return `Please lengthen this text to ${characters(min)} or more (you are currently using ${characters(len)}).`;
}

export function msgUnderflow(min: string, isDate: boolean): string {
  return isDate ? `Value must be ${min} or later.` : `Value must be greater than or equal to ${min}.`;
}

export function msgOverflow(max: string, isDate: boolean): string {
  return isDate ? `Value must be ${max} or earlier.` : `Value must be less than or equal to ${max}.`;
}

export function msgStep(low: string | null, high: string | null): string {
  if (low !== null && high !== null) return `Please enter a valid value. The two nearest valid values are ${low} and ${high}.`;
  const v = low ?? high;
  return v === null ? MSG_BAD_INPUT : `Please enter a valid value. The nearest valid value is ${v}.`;
}
