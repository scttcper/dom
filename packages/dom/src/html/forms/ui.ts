// UI-side value and selection internals for user-event.
//
// Upstream @testing-library/user-event patches `value`/`setSelectionRange` on each element to
// tell user edits from script assignments ("UI value", "UI selection"). Here the elements
// expose that state directly, so user-event can:
//
//   setUIValue(input, "1e")   // what the user typed; value sanitizes to "", badInput = true
//   getUIValue(input)         // "1e" (falls back to .value)
//   setUISelection(el, 1, 3)  // caret/selection, also for email/number inputs whose
//   getUISelection(el)        //   selection APIs throw
//
// UI writes never go through the instance `value` property, so React's `_valueTracker` (which
// wraps that property) still sees the old value and `onChange` fires on the next input event.
// A script assignment to `value` clears the UI value, as in upstream user-event.

import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { T } from "../../nodes/tags.ts";
import { isEditable as isContentEditable } from "../shared.ts";
import {
  I_DATE,
  I_DATETIME_LOCAL,
  I_EMAIL,
  I_FILE,
  I_MONTH,
  I_NUMBER,
  I_TIME,
  I_WEEK,
  MODE_VALUE,
  inputType,
  isTextualType,
  supportsSelectionType,
  valueMode,
} from "./input-type.ts";
import { isMutable } from "./state.ts";
import { sanitizeValue, type HTMLInputElement } from "./HTMLInputElement.ts";
import type { HTMLTextAreaElement } from "./HTMLTextAreaElement.ts";
import type { HTMLOptionElement } from "./HTMLOptionElement.ts";
import { createFileList } from "../../window/FileList.ts";
import { optionSelect } from "./HTMLOptionElement.ts";
import type { HTMLSelectElement } from "./HTMLSelectElement.ts";

type El = Element | NodeImpl;

function implOf(el: El): NodeImpl {
  return (el as Element)._impl ?? (el as NodeImpl);
}

/** Input types a user types characters into (text-like, email, number, date/time fields). */
function isTypingType(type: number): boolean {
  return isTextualType(type) || type === I_NUMBER || (type >= I_DATE && type <= I_DATETIME_LOCAL);
}

/** Whether the user can edit the element's value by typing (mutable text control or editing host). */
export function isEditable(el: El): boolean {
  const impl = implOf(el);
  if (impl.tag === T.input) return isTypingType(inputType(impl)) && isMutable(impl);
  if (impl.tag === T.textarea) return isMutable(impl);
  return isContentEditable(impl);
}

/** Whether the selection APIs (selectionStart, setSelectionRange, ...) work on the element. */
export function supportsSelection(el: El): boolean {
  const impl = implOf(el);
  if (impl.tag === T.textarea) return true;
  return impl.tag === T.input && supportsSelectionType(inputType(impl));
}

/** Whether the element has a UI value/selection (input in value mode or textarea). */
export function hasUIValue(el: El): boolean {
  const impl = implOf(el);
  if (impl.tag === T.textarea) return true;
  return impl.tag === T.input && valueMode(inputType(impl)) === MODE_VALUE;
}

/** The value as the user sees it (raw typed text), falling back to `.value`. */
export function getUIValue(el: El): string {
  const impl = implOf(el);
  if (impl.tag === T.input) {
    const input = impl.node as HTMLInputElement;
    return input._uiValue ?? input.value;
  }
  if (impl.tag === T.textarea) return (impl.node as HTMLTextAreaElement).value;
  return "";
}

/**
 * Set the value as a user edit: sanitizes like the browser, marks the value dirty and
 * "last changed by a user edit" (tooLong/tooShort apply), records badInput when the typed text
 * cannot be represented (e.g. "1e" in a number field). Does not fire events.
 */
export function setUIValue(el: El, value: string): void {
  const impl = implOf(el);
  if (impl.tag === T.input) {
    const input = impl.node as HTMLInputElement;
    const type = inputType(impl);
    if (valueMode(type) !== MODE_VALUE) return;
    const sanitized = sanitizeValue(type, value, impl);
    impl.doc._version++;
    input._value = sanitized;
    input._dirtyValue = true;
    input._userEdited = true;
    input._uiValue = sanitized === value ? null : value;
    input._badInput = sanitized === "" && value !== "" && type !== I_EMAIL && !isTextualType(type);
    const len = value.length;
    if (input._selStart > len) input._selStart = len;
    if (input._selEnd > len) input._selEnd = len;
    return;
  }
  if (impl.tag === T.textarea) {
    const ta = impl.node as HTMLTextAreaElement;
    impl.doc._version++;
    ta._rawValue = value;
    ta._dirtyValue = true;
    ta._userEdited = true;
  }
}

/** Forget the UI value (the next getUIValue returns `.value`). */
export function clearUIValue(el: El): void {
  const impl = implOf(el);
  if (impl.tag === T.input) {
    const input = impl.node as HTMLInputElement;
    input._uiValue = null;
    input._badInput = false;
  }
}

export interface UISelection {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
}

/** The caret/selection inside an input or textarea (works for every value-mode input type). */
export function getUISelection(el: El): UISelection {
  const impl = implOf(el);
  const host = impl.node as unknown as { _selStart: number; _selEnd: number; _selDir: UISelection["direction"] };
  const len = getUIValue(el).length;
  return { start: Math.min(host._selStart, len), end: Math.min(host._selEnd, len), direction: host._selDir };
}

/** Set the caret/selection as the user would (no exceptions for email/number inputs). */
export function setUISelection(el: El, start: number, end: number = start, direction: UISelection["direction"] = "none"): void {
  const impl = implOf(el);
  if (impl.tag !== T.input && impl.tag !== T.textarea) return;
  const host = impl.node as unknown as { _selStart: number; _selEnd: number; _selDir: UISelection["direction"] };
  const len = getUIValue(el).length;
  let s = Math.max(0, Math.min(start, end));
  let e = Math.max(start, end);
  if (e > len) e = len;
  if (s > e) s = e;
  host._selStart = s;
  host._selEnd = e;
  host._selDir = direction;
}

/** Replace a file input's selected files as the file picker would (no events). */
export function setFilesFromUI(el: El, files: readonly File[]): void {
  const impl = implOf(el);
  if (impl.tag !== T.input || inputType(impl) !== I_FILE) return;
  impl.doc._version++;
  (impl.node as HTMLInputElement)._files = createFileList(files);
}

/** Set an option's selectedness as the user would (dirty; single selects deselect the rest). */
export function setOptionSelectedFromUI(option: El, selected: boolean): void {
  const impl = implOf(option);
  if (impl.tag !== T.option) return;
  const o = impl.node as HTMLOptionElement;
  o._setSelectedness(selected);
  o._dirtiness = true;
  const select = optionSelect(impl);
  if (select !== null) {
    const s = select.node as HTMLSelectElement;
    if (selected) s._deselectOthers(impl);
    s._updateSelectedContent();
  }
}

/** Set a checkbox/radio's checkedness as the user would (dirty; radio groups stay exclusive). */
export function setCheckedFromUI(el: El, checked: boolean): void {
  const impl = implOf(el);
  if (impl.tag !== T.input) return;
  (impl.node as HTMLInputElement)._setCheckedness(checked, true);
}
