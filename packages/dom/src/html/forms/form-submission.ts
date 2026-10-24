// Form submission, reset and implicit submission.
// https://html.spec.whatwg.org/#form-submission-algorithm
// https://html.spec.whatwg.org/#concept-form-reset
// https://html.spec.whatwg.org/#implicit-submission
// https://html.spec.whatwg.org/#constructing-the-form-data-set
//
// No navigation ever happens (docs/deviations.md): a submission that is not canceled ends
// after the `submit` event.

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import type { Element } from "../../nodes/Element.ts";
import { F_CONNECTED } from "../../nodes/constants.ts";
import { T } from "../../nodes/tags.ts";
import { asciiLowercase, attr } from "../../nodes/attributes.ts";
import { Event } from "../../events/Event.ts";
import { SubmitEvent } from "../../events/events.ts";
import type { EnumSpec } from "../reflect.ts";
import { dispatchTrusted, fireEvent } from "./common.ts";
import { formControls, hasDatalistAncestor, isActuallyDisabled, isResettable, isSubmittable } from "./form-associated.ts";
import {
  I_CHECKBOX,
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
  I_RESET,
  I_SEARCH,
  I_SUBMIT,
  I_TEL,
  I_TEXT,
  I_TIME,
  I_URL,
  I_WEEK,
  I_BUTTON,
  inputType,
} from "./input-type.ts";
import { isInvalidCandidate } from "./validation.ts";
import { setUserValidity } from "./user-validity.ts";
import { faceEntries, faceReset, isFACE, validatableOf } from "./face.ts";
import { listOfOptions } from "./collections.ts";
import { reportNotImplemented, stubbedMethod } from "../../window/not-implemented.ts";
import { $constructingEntryList, $firingSubmissionEvents, $lockedForReset, $window } from "../../keys.ts";

/**
 * jsdom ends a submission that was not canceled (requestSubmit, a submit button, implicit
 * submission) with a "Not implemented" report (window/not-implemented.ts).
 */
const REQUEST_SUBMIT_NOT_IMPLEMENTED = stubbedMethod("HTMLFormElement", "requestSubmit");

/** https://html.spec.whatwg.org/#attr-fs-enctype (formEnctype: missing → ""). */
export const FORM_ENCTYPE: EnumSpec = {
  keywords: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"],
  missing: "",
  invalid: "application/x-www-form-urlencoded",
};

/** https://html.spec.whatwg.org/#attr-fs-method (formMethod: missing → ""). */
export const FORM_METHOD: EnumSpec = { keywords: ["get", "post", "dialog"], missing: "", invalid: "get" };

/** Internal shape of HTMLFormElement used here (avoids a value import cycle). */
interface FormLike extends Element {
  [$firingSubmissionEvents]: boolean;
  [$lockedForReset]: boolean;
  [$constructingEntryList]: boolean;
  _controls(): NodeImpl[];
}

interface Resettable {
  _reset(): void;
}

/** https://html.spec.whatwg.org/#concept-submit-button */
export function isSubmitButton(el: NodeImpl): boolean {
  if (el.tag === T.button) return buttonType(el) === "submit";
  if (el.tag === T.input) {
    const t = inputType(el);
    return t === I_SUBMIT || t === I_IMAGE;
  }
  return false;
}

/** The button element's type state: https://html.spec.whatwg.org/#attr-button-type */
export function buttonType(el: NodeImpl): "submit" | "reset" | "button" {
  const v = attr(el, "type");
  if (v !== null) {
    const lower = asciiLowercase(v);
    if (lower === "reset" || lower === "button" || lower === "submit") return lower;
  }
  // The Auto state (missing / invalid value default): a button with a `command` or
  // `commandfor` attribute is a plain button, otherwise a submit button.
  // https://html.spec.whatwg.org/#attr-button-type-auto-state
  return el.attrs !== null && (attr(el, "commandfor") !== null || attr(el, "command") !== null) ? "button" : "submit";
}

/** https://html.spec.whatwg.org/#default-button — first submit button in tree order whose form owner is form. */
export function defaultButton(form: NodeImpl): NodeImpl | null {
  const controls = formControls(form, [], true);
  for (let i = 0; i < controls.length; i++) if (isSubmitButton(controls[i])) return controls[i];
  return null;
}

/**
 * https://html.spec.whatwg.org/#statically-validate-the-constraints — null for a positive result;
 * otherwise (negative) the unhandled invalid controls, those whose `invalid` event was not
 * canceled. Canceling every `invalid` event still makes the result negative.
 */
export function staticallyValidate(form: NodeImpl): NodeImpl[] | null {
  const controls = (form.node as unknown as FormLike)._controls();
  // Steps 1-2: the invalid controls.
  const invalid: NodeImpl[] = [];
  for (let i = 0; i < controls.length; i++) {
    const c = controls[i];
    if (!isSubmittable(c)) continue;
    if (isInvalidCandidate(validatableOf(c))) invalid.push(c);
  }
  // Step 3.
  if (invalid.length === 0) return null;
  // Steps 4-6.
  const unhandled: NodeImpl[] = [];
  for (let i = 0; i < invalid.length; i++) {
    if (fireEvent(invalid[i].node, "invalid", false, true)) unhandled.push(invalid[i]);
  }
  return unhandled;
}

/** https://html.spec.whatwg.org/#dom-form-checkvalidity */
export function formCheckValidity(form: NodeImpl): boolean {
  return staticallyValidate(form) === null;
}

/**
 * https://html.spec.whatwg.org/#concept-form-submit
 * `submitter` is the submit button or the form itself; `fromSubmit` is "submitted from submit() method".
 */
export function submitForm(form: NodeImpl, submitter: NodeImpl, fromSubmit: boolean): void {
  const f = form.node as unknown as FormLike;
  // Step 1: if form cannot navigate (not connected), return.
  if ((form.flags & F_CONNECTED) === 0) return;
  // Step 2: if form's constructing entry list is true, return.
  if (f[$constructingEntryList]) return;
  // Step 5: if submitted from submit() is false:
  if (!fromSubmit) {
    // 5.1-5.2.
    if (f[$firingSubmissionEvents]) return;
    f[$firingSubmissionEvents] = true;
    try {
      // 5.3: set the user validity of every submittable element whose form owner is form
      // (https://html.spec.whatwg.org/#user-validity, forms/user-validity.ts).
      const controls = f._controls();
      for (let i = 0; i < controls.length; i++) if (isSubmittable(controls[i])) setUserValidity(controls[i], true);
      // 5.4: interactively validate constraints unless the submitter's no-validate state is true.
      const noValidate =
        submitter !== form && attr(submitter, "formnovalidate") !== null ? true : attr(form, "novalidate") !== null;
      if (!noValidate) {
        // https://html.spec.whatwg.org/#interactively-validate-the-constraints — step 3 ("report
        // the problems", where browsers focus the first unhandled invalid control) does nothing,
        // like jsdom and happy-dom: focus stays on the submitter (docs/deviations.md).
        if (staticallyValidate(form) !== null) return;
      }
      // 5.5–5.8: fire submit (SubmitEvent) with submitter (null when the form submits itself).
      const event = new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submitter === form ? null : submitter.node });
      if (!dispatchTrusted(f, event)) return;
    } finally {
      f[$firingSubmissionEvents] = false;
    }
    // 5.9: form may have been disconnected by a listener.
    if ((form.flags & F_CONNECTED) === 0) return;
  }
  // Steps 10-11: method "dialog" closes the form's dialog (html/interactive.ts).
  if (dialogSubmission !== null && dialogSubmission(form, submitter)) return;
  // Steps 6-9 and 12+: construct the entry list and navigate. We never navigate.
  if (!fromSubmit) reportNotImplemented(form.doc[$window] as object | null, REQUEST_SUBMIT_NOT_IMPLEMENTED);
}

/**
 * Steps 8–9 for method=dialog, registered by src/html/interactive.ts (a static import would be
 * an import cycle: interactive.ts → HTMLElement → … → this module).
 */
let dialogSubmission: ((form: NodeImpl, submitter: NodeImpl) => boolean) | null = null;
export function setDialogSubmission(fn: (form: NodeImpl, submitter: NodeImpl) => boolean): void {
  dialogSubmission = fn;
}

/** https://html.spec.whatwg.org/#concept-form-reset */
export function resetForm(form: NodeImpl): void {
  const f = form.node as unknown as FormLike;
  if (f[$lockedForReset]) return;
  f[$lockedForReset] = true;
  try {
    if (fireEvent(f, "reset", true, true)) {
      const controls = formControls(form, [], true);
      for (let i = 0; i < controls.length; i++) {
        const c = controls[i];
        if (isFACE(c)) faceReset(c);
        else if (isResettable(c)) (c.node as unknown as Resettable)._reset();
      }
    }
  } finally {
    f[$lockedForReset] = false;
  }
}

/** Input types whose fields block implicit submission: https://html.spec.whatwg.org/#field-that-blocks-implicit-submission */
function blocksImplicitSubmission(type: number): boolean {
  switch (type) {
    case I_TEXT:
    case I_SEARCH:
    case I_URL:
    case I_TEL:
    case I_EMAIL:
    case I_PASSWORD:
    case I_DATE:
    case I_MONTH:
    case I_WEEK:
    case I_TIME:
    case I_DATETIME_LOCAL:
    case I_NUMBER:
      return true;
  }
  return false;
}

/**
 * https://html.spec.whatwg.org/#implicit-submission — what pressing Enter in a field does.
 * Exported for user-event's keyboard implementation.
 */
export function implicitSubmission(form: NodeImpl): void {
  const button = defaultButton(form);
  if (button !== null) {
    // Fire a synthetic click at the default button (unless it is disabled).
    if (isActuallyDisabled(button)) return;
    syntheticClick(button.node as Element);
    return;
  }
  const controls = (form.node as unknown as FormLike)._controls();
  let blocking = 0;
  for (let i = 0; i < controls.length; i++) {
    const c = controls[i];
    if (c.tag === T.input && blocksImplicitSubmission(inputType(c))) blocking++;
  }
  if (blocking > 1) return;
  submitForm(form, form, false);
}

interface Activatable {
  _activationBehavior(event: Event | null): void;
}

/**
 * Run synthetic click activation steps on `el`. Uses HTMLElement.click() when the
 * html-elements/events agents provide it; otherwise dispatches a click and runs the element's
 * activation behavior directly.
 */
export function syntheticClick(el: Element): void {
  const click = (el as unknown as { click?: () => void }).click;
  if (typeof click === "function") {
    click.call(el);
    return;
  }
  // TODO(events): remove once HTMLElement.prototype.click runs the activation algorithm.
  const event = new Event("click", { bubbles: true, cancelable: true, composed: true });
  if (el.dispatchEvent(event)) (el as unknown as Activatable)._activationBehavior?.(event);
}

// --- entry list ------------------------------------------------------------------------------

export type Entry = [name: string, value: string | File];

interface InputLike {
  value: string;
  checked: boolean;
  files: { length: number; item(i: number): File | null } | null;
}

/**
 * https://html.spec.whatwg.org/#textarea-wrapping-transformation for the entry list: with
 * wrap=hard, line breaks are inserted so no line exceeds `cols` characters. Without layout,
 * lines break after the last space within the limit, else hard at the limit. (Newlines are
 * already normalized to LF in the API value.)
 */
function textareaWrappingTransformation(textarea: NodeImpl, value: string): string {
  const wrap = attr(textarea, "wrap");
  if (wrap === null || asciiLowercase(wrap) !== "hard") return value;
  const cols = (textarea.node as unknown as { cols: number }).cols;
  const lines = value.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.length <= cols) continue;
    let out = "";
    while (line.length > cols) {
      const space = line.lastIndexOf(" ", cols);
      const cut = space > 0 ? space + 1 : cols;
      out += line.slice(0, cut) + "\n";
      line = line.slice(cut);
    }
    lines[i] = out + line;
  }
  return lines.join("\n");
}

/**
 * https://html.spec.whatwg.org/#constructing-the-form-data-set — returns null when the form is
 * already constructing its entry list.
 */
export function constructEntryList(
  form: NodeImpl,
  submitter: NodeImpl | null,
  beforeUnlock: ((entries: Entry[]) => void) | null = null,
): Entry[] | null {
  const f = form.node as unknown as FormLike;
  if (f[$constructingEntryList]) return null;
  f[$constructingEntryList] = true;
  const entries: Entry[] = [];
  try {
    const controls = formControls(form, [], true);
    for (let i = 0; i < controls.length; i++) {
      const field = controls[i];
      if (!isSubmittable(field)) continue;
      // Step 5.1: skip datalist descendants, disabled fields, non-submitter buttons,
      // unchecked checkboxes/radios.
      if (hasDatalistAncestor(field) || isActuallyDisabled(field)) continue;
      const tag = field.tag;
      const type = tag === T.input ? inputType(field) : -1;
      const isButton = tag === T.button || type === I_SUBMIT || type === I_RESET || type === I_BUTTON || type === I_IMAGE;
      if (isButton && field !== submitter) continue;
      const w = field.node as unknown as InputLike;
      if ((type === I_CHECKBOX || type === I_RADIO) && !w.checked) continue;
      // Step 5.2: image buttons append name.x / name.y (we have no click coordinate: 0,0).
      if (type === I_IMAGE) {
        const n = attr(field, "name") ?? "";
        const prefix = n === "" ? "" : n + ".";
        entries.push([prefix + "x", "0"], [prefix + "y", "0"]);
        continue;
      }
      // Step 5.4: form-associated custom elements run entry construction.
      if (isFACE(field)) {
        faceEntries(field, entries);
        continue;
      }
      // Step 5.5: skip fields without a name or with an empty name.
      const name = attr(field, "name");
      if (name === null || name === "") continue;
      if (tag === T.select) {
        const options = listOfOptions(field, []);
        for (let j = 0; j < options.length; j++) {
          const o = options[j];
          const ow = o.node as unknown as { selected: boolean; value: string };
          if (ow.selected && !isActuallyDisabled(o)) entries.push([name, ow.value]);
        }
      } else if (type === I_CHECKBOX || type === I_RADIO) {
        entries.push([name, attr(field, "value") ?? "on"]);
      } else if (type === I_FILE) {
        const files = w.files;
        if (files === null || files.length === 0) {
          entries.push([name, new File([], "", { type: "application/octet-stream" })]);
        } else {
          for (let j = 0; j < files.length; j++) entries.push([name, files.item(j)!]);
        }
      } else if (type === I_HIDDEN && name.toLowerCase() === "_charset_") {
        entries.push([name, "UTF-8"]);
      } else if (tag === T.textarea) {
        entries.push([name, textareaWrappingTransformation(field, w.value)]);
      } else {
        entries.push([name, w.value]);
      }
      // Step 5.12: dirname.
      if (tag === T.textarea || (tag === T.input && (type === I_TEXT || type === I_SEARCH || type === I_HIDDEN || type === I_SUBMIT || type === I_RESET || type === I_TEL || type === I_URL || type === I_EMAIL || type === I_PASSWORD))) {
        const dirname = attr(field, "dirname");
        if (dirname !== null && dirname !== "") entries.push([dirname, "ltr"]);
      }
    }
    // Steps 6–7 (the `formdata` event) run while the constructing flag is still set.
    if (beforeUnlock !== null) beforeUnlock(entries);
  } finally {
    f[$constructingEntryList] = false;
  }
  return entries;
}
