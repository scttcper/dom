// The state of an <input> or <textarea>, in an object of its own.
//
// React makes every input and textarea it mounts a controlled-value tracker: `trackValueOnNode`
// (react-dom's inputValueTracking) defines an own `value` (or `checked`) accessor on the element,
// with closures of its own per element. V8 keeps one hidden class per accessor pair, so the second
// element to get one is normalized to dictionary mode, and a dictionary costs ~24 B per own
// property rounded up to a power of two, with every later read a hash lookup. With this state as
// 17 own fields of the wrapper, a tracked input was 2,238 B against 390 B untracked and reads
// through it were 6x slower. Here it is one own property of the wrapper, and these fields stay in
// a fast object with one hidden class for both elements.

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import type { FileList } from "../../window/FileList.ts";

export class ControlState {
  /**
   * The value while the dirty value flag is set: an input's in value mode "value", a textarea's
   * raw value.
   */
  value: string;
  /** https://html.spec.whatwg.org/#concept-input-value-dirty-flag, https://html.spec.whatwg.org/#concept-textarea-dirty */
  dirtyValue: boolean;
  /** Checkedness, authoritative only when `checkedSet` (otherwise derived from the checked attribute). */
  checked: boolean;
  checkedSet: boolean;
  /** https://html.spec.whatwg.org/#concept-input-checked-dirty-flag */
  dirtyChecked: boolean;
  indeterminate: boolean;
  files: FileList | null;
  selStart: number;
  selEnd: number;
  selDir: "forward" | "backward" | "none";
  /** The value was last changed by a user edit (tooLong/tooShort only apply then). */
  userEdited: boolean;
  /** The user typed something the type cannot represent (e.g. "1e" in a number field). */
  badInput: boolean;
  /** User-event's UI value (raw typed text) — null when it equals the value. See ui.ts. */
  uiValue: string | null;
  // Legacy-pre-activation state (https://html.spec.whatwg.org/#legacy-pre-activation-behavior).
  preChecked: boolean;
  preIndeterminate: boolean;
  preCheckedRadio: NodeImpl | null;
  /** Legacy-pre-activation ran (and changed state) for the current dispatch. */
  preApplied: boolean;

  constructor() {
    this.value = "";
    this.dirtyValue = false;
    this.checked = false;
    this.checkedSet = false;
    this.dirtyChecked = false;
    this.indeterminate = false;
    this.files = null;
    this.selStart = 0;
    this.selEnd = 0;
    this.selDir = "none";
    this.userEdited = false;
    this.badInput = false;
    this.uiValue = null;
    this.preChecked = false;
    this.preIndeterminate = false;
    this.preCheckedRadio = null;
    this.preApplied = false;
  }
}
