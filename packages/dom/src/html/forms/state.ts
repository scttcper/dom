// Form control state predicates for selectors (:disabled, :checked, :valid, ...), jest-dom
// matchers and aria states. All take a NodeImpl and are allocation-free for the common cases.
// https://html.spec.whatwg.org/#pseudo-classes

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { T } from "../../nodes/tags.ts";
import { nextElementInTree } from "../../nodes/traverse.ts";
import { contentAttr } from "../reflect.ts";
import { isEditable } from "../shared.ts";
import { formControls, isActuallyDisabled } from "./form-associated.ts";
import {
  I_CHECKBOX,
  I_HIDDEN,
  I_NUMBER,
  I_RADIO,
  I_RANGE,
  inputType,
  isNumericType,
  placeholderApplies,
  readonlyApplies,
  requiredApplies,
} from "./input-type.ts";
import { V_RANGE_OVERFLOW, V_RANGE_UNDERFLOW, type Validatable } from "./validation.ts";
import { defaultButton } from "./form-submission.ts";
import { hasUserValidity } from "./user-validity.ts";
import { isFACE, validatableOf } from "./face.ts";
import type { HTMLInputElement } from "./HTMLInputElement.ts";
import { radioGroupHasNoChecked } from "./HTMLInputElement.ts";
import type { HTMLOptionElement } from "./HTMLOptionElement.ts";
import { $impl, $indeterminate } from "../../keys.ts";

export { isActuallyDisabled } from "./form-associated.ts";

/** `:disabled` — https://html.spec.whatwg.org/#selector-disabled */
export function isDisabled(el: NodeImpl): boolean {
  return isActuallyDisabled(el);
}

/** `:enabled` — button, input, select, textarea, optgroup, option, fieldset that are not disabled. */
export function isEnabled(el: NodeImpl): boolean {
  switch (el.tag) {
    case T.button:
    case T.input:
    case T.select:
    case T.textarea:
    case T.optgroup:
    case T.option:
    case T.fieldset:
      return !isActuallyDisabled(el);
  }
  return false;
}

/** https://html.spec.whatwg.org/#concept-fe-mutable for input/textarea/select. */
export function isMutable(el: NodeImpl): boolean {
  switch (el.tag) {
    case T.input:
      return !isActuallyDisabled(el) && !(readonlyApplies(inputType(el)) && contentAttr(el, "readonly") !== null);
    case T.textarea:
      return !isActuallyDisabled(el) && contentAttr(el, "readonly") === null;
    case T.select:
    case T.button:
      return !isActuallyDisabled(el);
  }
  return false;
}

/** `:read-write` — https://html.spec.whatwg.org/#selector-read-write */
export function isReadWrite(el: NodeImpl): boolean {
  if (el.tag === T.input) return readonlyApplies(inputType(el)) && isMutable(el);
  if (el.tag === T.textarea) return isMutable(el);
  return isEditable(el);
}

/** `:read-only` — every element that is not `:read-write`. */
export function isReadOnly(el: NodeImpl): boolean {
  return !isReadWrite(el);
}

/** The control has a `readonly` attribute that applies (aria-readonly semantics / jest-dom). */
export function hasReadonlyAttribute(el: NodeImpl): boolean {
  if (el.tag === T.input) return readonlyApplies(inputType(el)) && contentAttr(el, "readonly") !== null;
  if (el.tag === T.textarea) return contentAttr(el, "readonly") !== null;
  return false;
}

/** `:required` — https://html.spec.whatwg.org/#selector-required */
export function isRequired(el: NodeImpl): boolean {
  switch (el.tag) {
    case T.input:
      return requiredApplies(inputType(el)) && contentAttr(el, "required") !== null;
    case T.select:
    case T.textarea:
      return contentAttr(el, "required") !== null;
  }
  return false;
}

/** `:optional` — input/select/textarea that are not required. */
export function isOptional(el: NodeImpl): boolean {
  return (el.tag === T.input || el.tag === T.select || el.tag === T.textarea) && !isRequired(el);
}

function validatable(el: NodeImpl): Validatable | null {
  if (isFACE(el)) return validatableOf(el);
  switch (el.tag) {
    case T.input:
    case T.select:
    case T.textarea:
    case T.button:
    case T.output:
    case T.fieldset:
      return el.node as unknown as Validatable;
  }
  return null;
}

/** Candidate for constraint validation that suffers from no constraint violation. */
function candidateState(el: NodeImpl): number {
  const v = validatable(el);
  if (v === null || v._barredFromValidation()) return 0;
  return v._validityFlags() === 0 ? 1 : 2;
}

/** Whether any listed descendant (fieldset) or owned control (form) is an invalid candidate. */
function hasInvalidControl(el: NodeImpl): boolean {
  if (el.tag === T.form) {
    const controls = formControls(el, [], true);
    for (let i = 0; i < controls.length; i++) if (candidateState(controls[i]) === 2) return true;
    return false;
  }
  for (let n = nextElementInTree(el, el); n !== null; n = nextElementInTree(n, el)) {
    if (candidateState(n) === 2) return true;
  }
  return false;
}

/** `:valid` — https://html.spec.whatwg.org/#selector-valid */
export function isValid(el: NodeImpl): boolean {
  if (el.tag === T.form || el.tag === T.fieldset) return !hasInvalidControl(el);
  return candidateState(el) === 1;
}

/** `:invalid` — https://html.spec.whatwg.org/#selector-invalid */
export function isInvalid(el: NodeImpl): boolean {
  if (el.tag === T.form || el.tag === T.fieldset) return hasInvalidControl(el);
  return candidateState(el) === 2;
}

/**
 * `:user-valid` — https://html.spec.whatwg.org/#selector-user-valid: input, textarea and select
 * whose user validity is true (forms/user-validity.ts), candidates for constraint validation
 * that satisfy their constraints.
 */
export function isUserValid(el: NodeImpl): boolean {
  return hasUserValidity(el) && candidateState(el) === 1;
}

/** `:user-invalid` — https://html.spec.whatwg.org/#selector-user-invalid: as `:user-valid`, but suffering from a constraint violation. */
export function isUserInvalid(el: NodeImpl): boolean {
  return hasUserValidity(el) && candidateState(el) === 2;
}

function hasRangeLimitations(el: NodeImpl): boolean {
  if (el.tag !== T.input) return false;
  const type = inputType(el);
  if (!isNumericType(type)) return false;
  return type === I_RANGE || contentAttr(el, "min") !== null || contentAttr(el, "max") !== null;
}

/** `:in-range` — https://html.spec.whatwg.org/#selector-in-range */
export function isInRange(el: NodeImpl): boolean {
  if (!hasRangeLimitations(el)) return false;
  const v = el.node as unknown as Validatable;
  if (v._barredFromValidation()) return false;
  return (v._validityFlags() & (V_RANGE_UNDERFLOW | V_RANGE_OVERFLOW)) === 0;
}

/** `:out-of-range` — https://html.spec.whatwg.org/#selector-out-of-range */
export function isOutOfRange(el: NodeImpl): boolean {
  if (!hasRangeLimitations(el)) return false;
  const v = el.node as unknown as Validatable;
  if (v._barredFromValidation()) return false;
  return (v._validityFlags() & (V_RANGE_UNDERFLOW | V_RANGE_OVERFLOW)) !== 0;
}

/** `:checked` — checkbox/radio checkedness, option selectedness. https://html.spec.whatwg.org/#selector-checked */
export function isChecked(el: NodeImpl): boolean {
  if (el.tag === T.input) {
    const type = inputType(el);
    return (type === I_CHECKBOX || type === I_RADIO) && (el.node as HTMLInputElement)._checkedness();
  }
  if (el.tag === T.option) return (el.node as HTMLOptionElement)._selectednessNow();
  return false;
}

/** `:indeterminate` — https://html.spec.whatwg.org/#selector-indeterminate */
export function isIndeterminate(el: NodeImpl): boolean {
  if (el.tag === T.input) {
    const type = inputType(el);
    if (type === I_CHECKBOX) return (el.node as HTMLInputElement)[$indeterminate];
    if (type === I_RADIO) return radioGroupHasNoChecked(el);
    return false;
  }
  if (el.tag === T.progress) return contentAttr(el, "value") === null;
  return false;
}

/** `:default` — https://html.spec.whatwg.org/#selector-default */
export function isDefault(el: NodeImpl): boolean {
  switch (el.tag) {
    case T.input: {
      const type = inputType(el);
      if (type === I_CHECKBOX || type === I_RADIO) return contentAttr(el, "checked") !== null;
      return isDefaultButton(el);
    }
    case T.button:
      return isDefaultButton(el);
    case T.option:
      return contentAttr(el, "selected") !== null;
  }
  return false;
}

function isDefaultButton(el: NodeImpl): boolean {
  const node = el.node as unknown as { form: { [$impl]: NodeImpl } | null };
  const form = node.form;
  return form !== null && defaultButton(form[$impl]) === el;
}

/** `:placeholder-shown` — https://html.spec.whatwg.org/#selector-placeholder-shown */
export function isPlaceholderShown(el: NodeImpl): boolean {
  if (el.tag === T.input) {
    if (!placeholderApplies(inputType(el)) || contentAttr(el, "placeholder") === null) return false;
    return (el.node as HTMLInputElement).value === "";
  }
  if (el.tag === T.textarea) {
    if (contentAttr(el, "placeholder") === null) return false;
    return (el.node as unknown as { value: string }).value === "";
  }
  return false;
}

/** `:autofill` never matches (no autofill). */
export function isAutofilled(_el: NodeImpl): boolean {
  return false;
}

/** Whether the element is a form control whose value the user can type into. */
export function isTextControl(el: NodeImpl): boolean {
  if (el.tag === T.textarea) return true;
  if (el.tag !== T.input) return false;
  const type = inputType(el);
  return type !== I_HIDDEN && type <= I_NUMBER;
}

// --- raw state readers (no public-API dispatch; for aria / jest-dom / user-event) -----------

/** The current value of an input, textarea or select (what `.value` returns); "" otherwise. */
export function controlValue(el: NodeImpl): string {
  switch (el.tag) {
    case T.input:
    case T.textarea:
    case T.select:
    case T.option:
    case T.button:
    case T.output:
      return (el.node as unknown as { value: string }).value;
  }
  return "";
}

/** Checkedness of an input (any type), false for other elements. */
export function inputChecked(el: NodeImpl): boolean {
  return el.tag === T.input && (el.node as HTMLInputElement)._checkedness();
}

/** The indeterminate IDL flag of an input. */
export function inputIndeterminate(el: NodeImpl): boolean {
  return el.tag === T.input && (el.node as HTMLInputElement)[$indeterminate];
}

/** Selectedness of an option. */
export function optionSelected(el: NodeImpl): boolean {
  return el.tag === T.option && (el.node as HTMLOptionElement)._selectednessNow();
}
