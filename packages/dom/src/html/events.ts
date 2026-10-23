// Event firing helpers for src/html (focus, popover/dialog/details toggles, synthetic clicks).
// https://dom.spec.whatwg.org/#concept-event-fire
// https://html.spec.whatwg.org/#fire-a-focus-event
// https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event
//
// The event classes and the dispatch algorithm belong to src/events; this module is the one
// place in src/html that constructs events. User-agent events are trusted (isTrusted = true);
// `click()` is the synthetic, untrusted exception.

import type { EventTarget } from "../events/EventTarget.ts";
import { fireAnEvent, fireSyntheticPointerEvent } from "../events/fire.ts";
import { FocusEvent } from "../events/UIEvents.ts";
import { ToggleEvent } from "../events/events.ts";

/** https://dom.spec.whatwg.org/#concept-event-fire — returns false if canceled. */
export function fireEvent(target: EventTarget, type: string, bubbles = false, cancelable = false): boolean {
  return fireAnEvent(type, target, undefined, { bubbles, cancelable });
}

/** https://html.spec.whatwg.org/#fire-a-focus-event (composed, `view` = the window). */
export function fireFocusEvent(target: EventTarget, type: string, relatedTarget: EventTarget | null, bubbles: boolean, view: unknown): void {
  fireAnEvent(type, target, FocusEvent as never, { bubbles, cancelable: false, composed: true, relatedTarget, view, detail: 0 } as never);
}

/** https://html.spec.whatwg.org/#the-toggleevent-interface — returns false if canceled. */
export function fireToggleEvent(target: EventTarget, type: string, oldState: string, newState: string, cancelable: boolean, source: EventTarget | null = null): boolean {
  return fireAnEvent(type, target, ToggleEvent as never, { bubbles: false, cancelable, oldState, newState, source } as never);
}

/**
 * https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event named "click" with the not
 * trusted flag set (HTMLElement.click()). Activation behavior runs inside dispatch (src/events).
 */
export function fireSyntheticClick(target: EventTarget): boolean {
  return fireSyntheticPointerEvent("click", target, true);
}

/** A queued task (https://html.spec.whatwg.org/#queue-a-task): a macrotask, after microtasks. */
export function queueTask(fn: () => void): void {
  setTimeout(fn, 0);
}
