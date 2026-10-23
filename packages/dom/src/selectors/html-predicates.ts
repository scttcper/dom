// Installs the HTML areas' element-state predicates into the selector engine.
// https://html.spec.whatwg.org/#pseudo-classes
//
// Imported LAST by src/index.ts (after every element class has been defined) so that the
// selector engine never statically imports html modules — see the note at the top of state.ts.

import {
  isAutofilled,
  isChecked,
  isDefault,
  isDisabled,
  isEnabled,
  isIndeterminate,
  isInRange,
  isInvalid,
  isOptional,
  isOutOfRange,
  isPlaceholderShown,
  isReadOnly,
  isReadWrite,
  isRequired,
  isValid,
} from "../html/forms/state.ts";
import { matchesFocus, matchesFocusVisible, matchesFocusWithin } from "../html/focus.ts";
import { matchesModal, matchesPopoverOpen } from "../html/top-layer.ts";
import { isDefined } from "../html/custom-elements.ts";
import { predicates } from "./state.ts";
import { clearSelectorCaches } from "./index.ts";

Object.assign(predicates, {
  focus: matchesFocus,
  "focus-within": matchesFocusWithin,
  "focus-visible": matchesFocusVisible,
  defined: isDefined,
  checked: isChecked,
  indeterminate: isIndeterminate,
  default: isDefault,
  disabled: isDisabled,
  enabled: isEnabled,
  required: isRequired,
  optional: isOptional,
  "read-only": isReadOnly,
  "read-write": isReadWrite,
  "placeholder-shown": isPlaceholderShown,
  valid: isValid,
  invalid: isInvalid,
  "in-range": isInRange,
  "out-of-range": isOutOfRange,
  autofill: isAutofilled,
  "-webkit-autofill": isAutofilled,
  "popover-open": matchesPopoverOpen,
  modal: matchesModal,
});
clearSelectorCaches();
