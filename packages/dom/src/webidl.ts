// WebIDL dictionary and callback types used across the DOM. The packages compile WITHOUT
// lib.dom.d.ts (we are the DOM), so these are declared here.

import type { Event } from "./events/Event.ts";

export interface EventListener {
  (event: Event): void;
}

export interface EventListenerObject {
  handleEvent(event: Event): void;
}

export type EventListenerOrEventListenerObject = EventListener | EventListenerObject;

export interface EventListenerOptions {
  capture?: boolean;
}

export interface AddEventListenerOptions extends EventListenerOptions {
  once?: boolean;
  passive?: boolean;
  signal?: AbortSignal;
}

export interface EventInit {
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
}

export interface ElementCreationOptions {
  is?: string;
}

export interface ShadowRootInit {
  mode: "open" | "closed";
  delegatesFocus?: boolean;
  slotAssignment?: "manual" | "named";
  clonable?: boolean;
  serializable?: boolean;
}

export interface GetRootNodeOptions {
  composed?: boolean;
}
