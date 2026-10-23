// Nested browsing contexts for <iframe> (minimal).
// https://html.spec.whatwg.org/#the-iframe-element
// https://html.spec.whatwg.org/#create-a-new-child-navigable
//
// When an iframe becomes connected in a document that has a browsing context, it gets a nested
// Window (initial about:blank document, or its `srcdoc` parsed). `src` is never fetched: the
// content stays about:blank with the document URL set to `src` (docs/deviations.md). `load`
// fires asynchronously at the iframe, like jsdom. Disconnecting the iframe closes the window.
// The nested window never becomes the current window.
//
// This module is a leaf (html/elements.ts imports it while the node modules initialize):
// Window.ts registers the factory when it loads.

import { Event } from "../events/Event.ts";
import type { Element } from "../nodes/Element.ts";
import { attr } from "../nodes/attributes.ts";
import type { Window } from "./Window.ts";

type NestedWindowFactory = (frameElement: Element, parent: Window, src: string | null, srcdoc: string | null) => Window;

let factory: NestedWindowFactory | null = null;

/** @internal Window.ts registers how nested windows are created. */
export function setNestedWindowFactory(f: NestedWindowFactory): void {
  factory = f;
}

const contexts = new WeakMap<Element, Window>();

/** The iframe's nested window (https://html.spec.whatwg.org/#dom-iframe-contentwindow), or null. */
export function frameContentWindow(frame: Element): Window | null {
  return contexts.get(frame) ?? null;
}

/** https://html.spec.whatwg.org/#the-iframe-element:html-element-insertion-steps */
export function frameConnected(frame: Element): void {
  if (factory === null || contexts.has(frame)) return;
  const parent = frame._impl.doc._window;
  // Only documents with a browsing context get nested ones (not DOMParser/template documents).
  if (parent === null || parent._closed) return;
  const impl = frame._impl;
  const window = factory(frame, parent, attr(impl, "src"), attr(impl, "srcdoc"));
  contexts.set(frame, window);
  // https://html.spec.whatwg.org/#iframe-load-event-steps — queued, so listeners added right
  // after insertion see it.
  parent._task(() => {
    if (contexts.get(frame) === window) frame.dispatchEvent(new Event("load"));
  }, 0);
}

/** https://html.spec.whatwg.org/#the-iframe-element:html-element-removing-steps */
export function frameDisconnected(frame: Element): void {
  const window = contexts.get(frame);
  if (window === undefined) return;
  contexts.delete(frame);
  window.close();
}
