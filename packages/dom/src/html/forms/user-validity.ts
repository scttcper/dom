// The user validity flag of input, textarea and select elements, and the :user-valid /
// :user-invalid pseudo-classes it drives.
// https://html.spec.whatwg.org/#user-validity
// https://html.spec.whatwg.org/#selector-user-valid
// https://drafts.csswg.org/selectors-4/#user-pseudos
//
// The HTML Standard sets the flag to true right before the user agent fires a `change` event
// for a committed user edit (https://html.spec.whatwg.org/#common-input-element-events,
// https://html.spec.whatwg.org/#focus-update-steps step 3.1, and
// https://html.spec.whatwg.org/#send-select-update-notifications step 1), and for every submittable element of a form when a
// submission is requested by the user or `requestSubmit()` (https://html.spec.whatwg.org/#concept-form-submit
// step 6.3). The reset algorithms set it back to false.
//
// A DOM without a UI has no user: @ctrl/dom/user-event, Testing Library's `fireEvent` and our own
// activation behaviors stand in for it, and the first two dispatch UNTRUSTED events. So here
// "the user committed a change" is: a `change` event is dispatched with the control as its
// target, trusted or not (user-event fires it on blur after typing, on selectOptions, on
// clicking a checkbox/radio, on upload; `fireEvent.change` fires it directly). `input` events
// alone do not set it, as in the spec and in browsers (typing shows :user-invalid only once the
// edit is committed by blur or Enter). Script calling `dispatchEvent(new Event("change"))` on a
// control therefore also sets it, which a browser would not (docs/deviations.md).

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { T } from "../../nodes/tags.ts";
import { $userValidity } from "../../keys.ts";

/** A control with a user validity flag (input, textarea, select): an own property once it is true. */
export interface UserValidityHolder {
  [$userValidity]?: boolean;
}

/**
 * Called by the event dispatch algorithm (events/dispatch.ts) with the target of a `change`
 * event, while building the path (https://dom.spec.whatwg.org/#concept-event-dispatch step
 * 6.8) and so before any listener runs: `change` listeners already see the new state. Only the
 * target counts: a `change` dispatched at an `<option>` reaches its `<select>` as a parent and
 * must not set the select's flag.
 */
export function noteChangeDispatch(target: NodeImpl): void {
  switch (target.tag) {
    case T.input:
    case T.textarea:
    case T.select:
      (target.node as unknown as UserValidityHolder)[$userValidity] = true;
  }
}

/** Whether `el` is an input, textarea or select whose user validity is true. */
export function hasUserValidity(el: NodeImpl): boolean {
  switch (el.tag) {
    case T.input:
    case T.textarea:
    case T.select:
      return (el.node as unknown as UserValidityHolder)[$userValidity] === true;
  }
  return false;
}

/** https://html.spec.whatwg.org/#concept-form-submit step 6.3: set user validity of the form's submittable controls. */
export function setUserValidity(el: NodeImpl, value: boolean): void {
  switch (el.tag) {
    case T.input:
    case T.textarea:
    case T.select:
      if (value || hasUserValidity(el)) (el.node as unknown as UserValidityHolder)[$userValidity] = value;
  }
}
