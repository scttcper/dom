// Form-associated custom elements (FACE): the forms side of ElementInternals.
// https://html.spec.whatwg.org/#form-associated-custom-elements
// https://html.spec.whatwg.org/#the-elementinternals-interface (form, labels, validity, setFormValue)
//
// A FACE is any custom element whose definition has `static formAssociated = true`;
// html/custom-elements.ts marks it with F_FACE, and the forms categories (listed, labelable,
// submittable, resettable) include it. Per-element state lives in a WeakMap here (FACEs are
// rare), and ElementInternals (html/HTMLElement.ts) delegates to these functions.
//
// The form callbacks (formAssociatedCallback, formResetCallback, formDisabledCallback) are
// enqueued as custom element callback reactions
// (https://html.spec.whatwg.org/#enqueue-a-custom-element-callback-reaction); owner/disabled
// changes are detected when the element itself is connected, disconnected, upgraded or has its
// form/disabled attribute changed.

import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { F_FACE, HTML_NS } from "../../nodes/constants.ts";
import { attr } from "../../nodes/attributes.ts";
import { enqueueFormCallback, flushReactions, setFaceUpgradeHook } from "../custom-elements.ts";
import { fireEvent } from "./common.ts";
import { formOwner, hasDatalistAncestor, isActuallyDisabled } from "./form-associated.ts";
import { LabelsNodeList } from "./collections.ts";
import {
  ValidityState,
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
  type Validatable,
} from "./validation.ts";
import { $customValidity, $host, $impl, $validity } from "../../keys.ts";

/** ValidityStateFlags dictionary keys in V_* bit order. */
const FLAG_NAMES: [string, number][] = [
  ["valueMissing", V_VALUE_MISSING],
  ["typeMismatch", V_TYPE_MISMATCH],
  ["patternMismatch", V_PATTERN_MISMATCH],
  ["tooLong", V_TOO_LONG],
  ["tooShort", V_TOO_SHORT],
  ["rangeUnderflow", V_RANGE_UNDERFLOW],
  ["rangeOverflow", V_RANGE_OVERFLOW],
  ["stepMismatch", V_STEP_MISMATCH],
  ["badInput", V_BAD_INPUT],
  ["customError", V_CUSTOM_ERROR],
];

/**
 * Per-FACE state. Doubles as the `Validatable` adapter that ValidityState and the form's static
 * validation read (the custom element itself has no validity members).
 */
export class FaceState {
  impl: NodeImpl;
  /** https://html.spec.whatwg.org/#face-submission-value */
  value: unknown;
  /** https://html.spec.whatwg.org/#face-state */
  state: unknown;
  flags: number;
  message: string;
  anchor: Element | null;
  validity: ValidityState | null;
  labels: LabelsNodeList | null;
  /** Last form owner / disabledness reported through the callbacks. */
  lastOwner: NodeImpl | null;
  lastDisabled: boolean;
  // Validatable members (unused fields of the interface kept for shape).
  [$customValidity]: string;
  [$validity]: ValidityState | null;

  constructor(impl: NodeImpl) {
    this.impl = impl;
    this.value = null;
    this.state = null;
    this.flags = 0;
    this.message = "";
    this.anchor = null;
    this.validity = null;
    this.labels = null;
    this.lastOwner = null;
    this.lastDisabled = false;
    this[$customValidity] = "";
    this[$validity] = null;
  }

  _validityFlags(): number {
    return this.flags;
  }

  /** https://html.spec.whatwg.org/#barred-from-constraint-validation (FACE: disabled, readonly, datalist). */
  _barredFromValidation(): boolean {
    const impl = this.impl;
    return isActuallyDisabled(impl) || attr(impl, "readonly") !== null || hasDatalistAncestor(impl);
  }

  _validationMessage(_flags: number): string {
    return this.message;
  }
}

const states = new WeakMap<NodeImpl, FaceState>();

export function isFACE(impl: NodeImpl): boolean {
  return (impl.flags & F_FACE) !== 0;
}

export function faceState(impl: NodeImpl): FaceState {
  let s = states.get(impl);
  if (s === undefined) {
    s = new FaceState(impl);
    states.set(impl, s);
  }
  return s;
}

/** The Validatable for a form control or FACE (used by static validation and :valid/:invalid). */
export function validatableOf(impl: NodeImpl): Validatable {
  return isFACE(impl) ? (faceState(impl) as unknown as Validatable) : (impl.node as unknown as Validatable);
}

function assertFACE(impl: NodeImpl, member: string): void {
  if (!isFACE(impl)) {
    throw new DOMException(
      `Failed to execute '${member}' on 'ElementInternals': The target element is not a form-associated custom element.`,
      "NotSupportedError",
    );
  }
}

// --- ElementInternals members ------------------------------------------------------------------

/** https://html.spec.whatwg.org/#dom-elementinternals-setformvalue */
export function internalsSetFormValue(impl: NodeImpl, value: unknown, state?: unknown): void {
  assertFACE(impl, "setFormValue");
  const s = faceState(impl);
  s.value = cloneSubmission(value);
  s.state = state === undefined ? s.value : cloneSubmission(state);
}

function cloneSubmission(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof FormData) {
    const copy = new FormData();
    for (const [k, v] of value) copy.append(k, v);
    return copy;
  }
  if (value instanceof File) return value;
  return String(value);
}

/** https://html.spec.whatwg.org/#dom-elementinternals-form */
export function internalsForm(impl: NodeImpl): Element | null {
  assertFACE(impl, "form");
  const owner = formOwner(impl);
  return owner === null ? null : (owner.node as Element);
}

/** https://html.spec.whatwg.org/#dom-elementinternals-labels */
export function internalsLabels(impl: NodeImpl): LabelsNodeList {
  assertFACE(impl, "labels");
  const s = faceState(impl);
  return (s.labels ??= new LabelsNodeList(impl));
}

/** https://html.spec.whatwg.org/#dom-elementinternals-setvalidity */
export function internalsSetValidity(impl: NodeImpl, flags: Record<string, unknown> | undefined, message?: string, anchor?: Element): void {
  assertFACE(impl, "setValidity");
  let bits = 0;
  if (flags !== undefined && flags !== null) {
    for (const [name, bit] of FLAG_NAMES) if (flags[name]) bits |= bit;
  }
  if (bits !== 0 && (message === undefined || String(message) === "")) {
    throw new TypeError("Failed to execute 'setValidity' on 'ElementInternals': The second argument should not be empty if one or more flags in the first argument are true.");
  }
  if (anchor !== undefined && anchor !== null) {
    // WebIDL: `optional HTMLElement anchor`.
    const a = (anchor as { [$impl]?: NodeImpl })[$impl];
    if (a === undefined || a.type !== 1 || a.ns !== HTML_NS) {
      throw new TypeError("Failed to execute 'setValidity' on 'ElementInternals': parameter 3 is not of type 'HTMLElement'.");
    }
    // Step 3: the anchor must be a shadow-including inclusive descendant of the element.
    let inside = false;
    for (let n: NodeImpl | null = a; n !== null; n = n.parent ?? ((n.node as unknown as { [$host]?: { [$impl]: NodeImpl } | null })[$host]?.[$impl] ?? null)) {
      if (n === impl) {
        inside = true;
        break;
      }
    }
    if (!inside) throw new DOMException("Failed to execute 'setValidity' on 'ElementInternals': The validation anchor is not a shadow-including descendant of the element.", "NotFoundError");
  }
  const s = faceState(impl);
  s.flags = bits;
  // Step 5: "normalize newlines" in the message.
  s.message = bits === 0 ? "" : String(message).replace(/\r\n?/g, "\n");
  s.anchor = anchor ?? null;
}

export function internalsWillValidate(impl: NodeImpl): boolean {
  assertFACE(impl, "willValidate");
  return !faceState(impl)._barredFromValidation();
}

export function internalsValidity(impl: NodeImpl): ValidityState {
  assertFACE(impl, "validity");
  const s = faceState(impl);
  return (s.validity ??= new ValidityState(s as unknown as Validatable));
}

export function internalsValidationMessage(impl: NodeImpl): string {
  assertFACE(impl, "validationMessage");
  const s = faceState(impl);
  return s._barredFromValidation() ? "" : s.message;
}

/** https://html.spec.whatwg.org/#dom-elementinternals-checkvalidity (reportValidity has no UI). */
export function internalsCheckValidity(impl: NodeImpl, member = "checkValidity"): boolean {
  assertFACE(impl, member);
  const s = faceState(impl);
  if (s._barredFromValidation() || s.flags === 0) return true;
  fireEvent(impl.node, "invalid", false, true);
  return false;
}

// --- form participation ------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#face-entry-construction */
export function faceEntries(impl: NodeImpl, out: [string, string | File][]): void {
  const value = states.get(impl)?.value ?? null;
  if (value === null) return;
  if (value instanceof FormData) {
    for (const [k, v] of value) out.push([k, v as string | File]);
    return;
  }
  const name = attr(impl, "name");
  if (name === null || name === "") return;
  out.push([name, value as string | File]);
}

function invoke(impl: NodeImpl, name: "formResetCallback" | "formAssociatedCallback" | "formDisabledCallback", args: unknown[]): void {
  enqueueFormCallback(impl.node as Element, name, args);
}

/** Reset algorithm for a FACE: enqueue formResetCallback. */
export function faceReset(impl: NodeImpl): void {
  invoke(impl, "formResetCallback", []);
}

/** End of a [CEReactions] API that enqueued FACE callbacks (form.reset()). */
export function flushFaceReactions(): void {
  flushReactions();
}

/**
 * Called from HTMLElement's connected/disconnected/attribute hooks for FACEs: report form owner
 * changes (formAssociatedCallback) and disabledness changes (formDisabledCallback).
 */
export function faceStateMaybeChanged(impl: NodeImpl): void {
  const s = faceState(impl);
  const owner = formOwner(impl);
  if (owner !== s.lastOwner) {
    s.lastOwner = owner;
    invoke(impl, "formAssociatedCallback", [owner === null ? null : owner.node]);
  }
  const disabled = isActuallyDisabled(impl);
  if (disabled !== s.lastDisabled) {
    s.lastDisabled = disabled;
    invoke(impl, "formDisabledCallback", [disabled]);
  }
}

setFaceUpgradeHook(faceStateMaybeChanged);
