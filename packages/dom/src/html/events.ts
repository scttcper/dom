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
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { currentWindowOrNull } from "../window/current.ts";
import { $impl, $window } from "../keys.ts";

/** https://dom.spec.whatwg.org/#concept-event-fire — returns false if canceled. */
export function fireEvent(target: EventTarget, type: string, bubbles = false, cancelable = false): boolean {
  return fireAnEvent(type, target, undefined, { bubbles, cancelable });
}

/** https://html.spec.whatwg.org/#fire-a-focus-event (composed, `view` = the window). */
export function fireFocusEvent(
  target: EventTarget,
  type: string,
  relatedTarget: EventTarget | null,
  bubbles: boolean,
  view: unknown,
): void {
  fireAnEvent(
    type,
    target,
    FocusEvent as never,
    { bubbles, cancelable: false, composed: true, relatedTarget, view, detail: 0 } as never,
  );
}

/** https://html.spec.whatwg.org/#the-toggleevent-interface — returns false if canceled. */
export function fireToggleEvent(
  target: EventTarget,
  type: string,
  oldState: string,
  newState: string,
  cancelable: boolean,
  source: EventTarget | null = null,
): boolean {
  return fireAnEvent(
    type,
    target,
    ToggleEvent as never,
    { bubbles: false, cancelable, oldState, newState, source } as never,
  );
}

/**
 * https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event named "click" with the not
 * trusted flag set (HTMLElement.click()). Activation behavior runs inside dispatch (src/events).
 */
export function fireSyntheticClick(target: EventTarget): boolean {
  return fireSyntheticPointerEvent("click", target, true);
}

/**
 * https://html.spec.whatwg.org/#queue-an-element-task — a macrotask on the element's window. Its
 * `_task` uses the window's timers (the test file's virtual clock or fake timers, so the task is
 * ordered with the test's own timers) and close() cancels it. A bare `setTimeout` here is the
 * outer Node realm's real timer under @ctrl/dom-jest-environment (this module is loaded outside the test
 * file's vm global): user-event's post-click wait on the virtual clock then resolved before a
 * <details> `toggle` fired. Documents without a browsing context use the current window.
 */
export function queueElementTask(element: NodeImpl | EventTarget, fn: () => void): void {
  const impl = "doc" in element ? (element as NodeImpl) : (element as unknown as { [$impl]: NodeImpl })[$impl];
  const window = impl.doc[$window] ?? currentWindowOrNull();
  if (window !== null) window._task(fn, 0);
  else setTimeout(fn, 0);
}
