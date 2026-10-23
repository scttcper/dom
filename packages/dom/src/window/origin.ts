// https://html.spec.whatwg.org/#concept-settings-object-origin
//
// A window's origin is its document's origin. Documents of nested browsing contexts that are
// about:blank or about:srcdoc inherit their creator's origin
// (https://html.spec.whatwg.org/#determining-the-origin, "If url is about:srcdoc" /
// "If url matches about:blank and sourceSnapshotParams's ... initiator origin"), which for an
// iframe's initial document is its parent document's origin. Without that, an iframe's
// localStorage, sessionStorage and postMessage would see an opaque ("null") origin.

import type { Window } from "./Window.ts";
import { $parentWindow, $url } from "../keys.ts";

/** @internal The serialized origin of `window`'s document. */
export function windowOrigin(window: Window): string {
  let w = window;
  while (w[$url].protocol === "about:" && w[$parentWindow] !== null) w = w[$parentWindow];
  return w[$url].origin;
}
