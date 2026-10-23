// User-agent event firing helpers for other areas (html-elements, html-forms, window, ...).
// https://dom.spec.whatwg.org/#concept-event-fire
// https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event

import { EF_TRUSTED, Event } from "./Event.ts";
import type { EventTarget } from "./EventTarget.ts";
import { dispatch } from "./dispatch.ts";
import { PointerEvent, type PointerEventInit } from "./UIEvents.ts";
import type { EventInit } from "../webidl.ts";

type EventCtor<E extends Event, I> = new (type: string, init?: I) => E;

/**
 * https://dom.spec.whatwg.org/#concept-event-fire — creates a *trusted* event of
 * `eventConstructor` (default Event) with `init`, and dispatches it at `target`.
 * Returns false if the event was canceled.
 */
export function fireAnEvent<E extends Event = Event, I extends EventInit = EventInit>(
  type: string,
  target: EventTarget,
  eventConstructor?: EventCtor<E, I>,
  init?: I,
  legacyTargetOverride = false,
): boolean {
  const event = eventConstructor === undefined ? new Event(type, init) : new eventConstructor(type, init);
  event._s.flags |= EF_TRUSTED;
  return dispatch(event, target, legacyTargetOverride);
}

/** Dispatch an already constructed event as a trusted (user-agent) event. */
export function dispatchTrusted(event: Event, target: EventTarget): boolean {
  event._s.flags |= EF_TRUSTED;
  return dispatch(event, target);
}

/**
 * https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event
 * What `HTMLElement.click()` uses: a PointerEvent with bubbles/cancelable/composed set,
 * view = the target's window, pointerId -1 (non-pointer device, as in jsdom). The caller
 * is responsible for the click-in-progress flag and the disabled check.
 */
export function fireSyntheticPointerEvent(type: string, target: EventTarget, notTrusted: boolean, init?: PointerEventInit): boolean {
  const impl = (target as unknown as { _impl?: { doc: { _window: unknown } } })._impl;
  const view = impl === undefined ? null : impl.doc._window;
  const event = new PointerEvent(type, {
    pointerId: -1,
    ...init,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: view as PointerEventInit["view"],
  });
  if (!notTrusted) event._s.flags |= EF_TRUSTED;
  return dispatch(event, target);
}
