// Activation behavior hook contract.
// https://dom.spec.whatwg.org/#eventtarget-activation-behavior
// https://dom.spec.whatwg.org/#eventtarget-legacy-pre-activation-behavior
// https://dom.spec.whatwg.org/#eventtarget-legacy-canceled-activation-behavior
// https://html.spec.whatwg.org/#activation-behavior
//
// The dispatch algorithm (dispatch.ts) treats an event as an *activation event* when it is a
// MouseEvent (PointerEvent included) whose type is "click". While building the event path it
// picks the activation target: the target itself if it has activation behavior, otherwise
// (for bubbling clicks) the first ancestor on the path that has one.
//
// Elements opt in by implementing `ActivationTarget` on their wrapper class prototype:
//
//   class HTMLAnchorElement extends HTMLElement {
//     get _hasActivationBehavior() { return hasAttr(this._impl, "href"); }
//     _activationBehavior(event) { ...follow the hyperlink... }
//   }
//   class HTMLInputElement extends HTMLElement {
//     get _hasActivationBehavior() { ... depends on type ... }
//     _legacyPreActivationBehavior() { ...checkbox: toggle checkedness, radio: check... }
//     _activationBehavior(event) { ...fire input + change, submit form, ... }
//     _legacyCanceledActivationBehavior() { ...restore checkedness... }
//   }
//
// Rules:
// - `_hasActivationBehavior` is read only for click MouseEvents (so it may be a getter that
//   inspects state, e.g. `type`/`href`/`disabled`), and only on the HTML elements that can
//   have activation behavior (`mayHaveActivationBehavior` below: a, area, button, input, label,
//   summary — a closed set in the HTML spec). It must be strictly `true` to count. Nothing is
//   ever read on other path items, so a <div>, a <form> (a Proxy) or a Document costs a click
//   nothing. A new activation behavior needs its tag added to that table.
// - `_legacyPreActivationBehavior()` runs after the path is built and before any listener
//   (checkbox/radio toggling, so listeners observe the new state).
// - After dispatch finishes (event path cleared, phase NONE): if the event was not canceled,
//   `_activationBehavior(event)` runs; otherwise `_legacyCanceledActivationBehavior()` runs
//   if defined (restore the state saved by the pre-activation step).
// - Disabled form controls: "A form control that is disabled must prevent any click events
//   that are queued on the user interaction task source from being dispatched on the element"
//   (https://html.spec.whatwg.org/#enabling-and-disabling-form-controls:-the-disabled-attribute)
//   is about *user interaction*, not dispatchEvent. user-event / `el.click()` owners handle
//   it; dispatch itself never filters events.
// - `HTMLElement.click()` should use `fireSyntheticPointerEvent("click", el, true)` from
//   dispatch.ts (https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event), which builds
//   a PointerEvent (bubbles, cancelable, composed) with isTrusted = false per the spec's
//   "not trusted flag", and respects the click-in-progress flag (owners keep that flag).

import type { Event } from "./Event.ts";
import { T } from "../nodes/tags.ts";

/** Indexed by `NodeImpl.tag`: 1 for the element tags whose classes implement ActivationTarget. */
const ACTIVATION_TAGS = new Uint8Array(256);
for (const tag of [T.a, T.area, T.button, T.input, T.label, T.summary]) ACTIVATION_TAGS[tag] = 1;

/** Whether an element with tag id `tag` can have activation behavior (the dispatch algorithm's gate). */
export function mayHaveActivationBehavior(tag: number): boolean {
  return ACTIVATION_TAGS[tag] === 1;
}

export interface ActivationTarget {
  readonly _hasActivationBehavior?: boolean;
  _activationBehavior?(event: Event): void;
  _legacyPreActivationBehavior?(): void;
  _legacyCanceledActivationBehavior?(): void;
}
