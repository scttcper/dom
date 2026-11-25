// The selection APIs of text controls, shared by input and textarea:
// https://html.spec.whatwg.org/#textFieldSelection

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import type { EventTarget } from "../../events/EventTarget.ts";
import { T } from "../../nodes/tags.ts";
import { queueElementTask } from "../events.ts";
import { fireEvent, toUnsignedLong } from "./common.ts";
import type { ControlState } from "./control-state.ts";
import { argumentsRequired } from "../../webidl-runtime.ts";
import { $control, $impl, $version } from "../../keys.ts";

interface SelectionHost {
  [$control]: ControlState;
  [$impl]: NodeImpl;
  /** The element's value (https://html.spec.whatwg.org/#concept-fe-api-value), not a `value` accessor a test installed. */
  _apiValue(): string;
  _selectionLength(): number;
  /** The selection APIs apply (always on a textarea). */
  _selectable(): boolean;
  /** The value setRangeText() stores: sanitized (input) or newline-normalized (textarea). */
  _rangeTextValue(value: string): string;
}

/** Only an input's type can make the selection APIs not apply (https://html.spec.whatwg.org/#do-not-apply). */
function assertSelectable(el: SelectionHost, member: string): void {
  if (!el._selectable()) {
    throw new DOMException(
      `Failed to ${member.endsWith(")") ? "execute" : "set"} '${member.replace("()", "")}' on 'HTMLInputElement': The input element's type ('${(el as unknown as { type: string }).type}') does not support selection.`,
      "InvalidStateError",
    );
  }
}

/**
 * The text control selection members of input and textarea
 * (https://html.spec.whatwg.org/#textFieldSelection), installed with installDefaults.
 */
export const textSelection = {
  /** https://html.spec.whatwg.org/#dom-textarea/input-selectionstart */
  get selectionStart(): number | null {
    const el = this as unknown as SelectionHost;
    return el._selectable() ? Math.min(el[$control].selStart, el._selectionLength()) : null;
  },

  set selectionStart(value: number | null) {
    const el = this as unknown as SelectionHost;
    assertSelectable(el, "selectionStart");
    const start = toUnsignedLong(value);
    setSelection(el, start, Math.max(start, this.selectionEnd!), el[$control].selDir);
  },

  get selectionEnd(): number | null {
    const el = this as unknown as SelectionHost;
    return el._selectable() ? Math.min(el[$control].selEnd, el._selectionLength()) : null;
  },

  set selectionEnd(value: number | null) {
    const el = this as unknown as SelectionHost;
    assertSelectable(el, "selectionEnd");
    setSelection(el, this.selectionStart!, toUnsignedLong(value), el[$control].selDir);
  },

  get selectionDirection(): string | null {
    const el = this as unknown as SelectionHost;
    return el._selectable() ? el[$control].selDir : null;
  },

  set selectionDirection(value: string | null) {
    const el = this as unknown as SelectionHost;
    assertSelectable(el, "selectionDirection");
    setSelection(el, this.selectionStart!, this.selectionEnd!, String(value));
  },

  /** https://html.spec.whatwg.org/#dom-textarea/input-setselectionrange */
  setSelectionRange(start: number, end: number, direction?: string): void {
    const el = this as unknown as SelectionHost;
    assertSelectable(el, "setSelectionRange()");
    setSelection(el, toUnsignedLong(start), toUnsignedLong(end), direction === undefined ? "none" : String(direction));
  },

  /** https://html.spec.whatwg.org/#dom-textarea/input-setrangetext */
  setRangeText(replacement: string, start?: number, end?: number, selectionMode?: string): void {
    const el = this as unknown as SelectionHost;
    if (arguments.length === 0)
      argumentsRequired("setRangeText", el[$impl].tag === T.input ? "HTMLInputElement" : "HTMLTextAreaElement", 1, 0);
    assertSelectable(el, "setRangeText()");
    const result = rangeText(
      el._apiValue(),
      el[$control].selStart,
      el[$control].selEnd,
      String(replacement),
      start,
      end,
      selectionMode,
      arguments.length,
    );
    el[$impl].doc[$version]++;
    el[$control].value = el._rangeTextValue(result.value);
    el[$control].dirtyValue = true;
    el[$control].uiValue = null;
    setSelection(el, result.start, result.end, "none");
  },
};

/**
 * https://html.spec.whatwg.org/#set-the-selection-range — when the selection changed, queue a
 * task to fire a bubbling `select` event at the element.
 */
export function setSelection(el: SelectionHost, start: number, end: number, direction: string): void {
  const len = el._selectionLength();
  if (end > len) end = len;
  if (start > end) start = end;
  const dir = direction === "forward" || direction === "backward" ? direction : "none";
  const changed =
    start !== Math.min(el[$control].selStart, len) ||
    end !== Math.min(el[$control].selEnd, len) ||
    dir !== el[$control].selDir;
  el[$control].selStart = start;
  el[$control].selEnd = end;
  el[$control].selDir = dir;
  if (changed) {
    const target = el as unknown as EventTarget;
    queueElementTask(target, () => fireEvent(target, "select", true, false));
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
    throw new DOMException(
      `Failed to execute 'setRangeText': The provided start value (${start}) is larger than the provided end value (${end}).`,
      "IndexSizeError",
    );
  }
  if (start > len) start = len;
  if (end > len) end = len;
  const mode = modeArg === undefined ? "preserve" : String(modeArg);
  if (mode !== "select" && mode !== "start" && mode !== "end" && mode !== "preserve") {
    throw new TypeError(
      `Failed to execute 'setRangeText': The provided value '${mode}' is not a valid enum value of type SelectionMode.`,
    );
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
