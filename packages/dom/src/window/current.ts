import type { Document } from "../nodes/Document.ts";
import type { Window } from "./Window.ts";

// Interface objects (Text, Event, DocumentFragment, ...) are module-level singletons shared
// by every Window instead of being re-created per window (jsdom/happy-dom do the latter,
// which dominates their startup time). Constructors that need "the current global object"
// (`new Text()`, `new DocumentFragment()`, `new Image()`) use the current window: the most
// recently created or explicitly activated one. Test environments activate exactly one.

let current: Window | null = null;

export function setCurrentWindow(window: Window | null): void {
  current = window;
}

export function currentWindow(): Window {
  if (current === null) throw new TypeError("No active @ctrl/dom window. Create one with createWindow().");
  return current;
}

export function currentDocument(): Document {
  return currentWindow().document;
}

/** The current window, or null when none is active (no throw). */
export function currentWindowOrNull(): Window | null {
  return current;
}
