// Integration points other areas plug into the Window without the window module importing
// them statically (they are built in parallel and some are optional).
//
// Each hook is consulted lazily, at call time. When a hook is null the Window falls back to a
// public export of the same name from `@ctrl/dom` (see interfaces.ts), and finally to a small
// built-in fallback. Areas register through `@ctrl/dom/internal`:
//
//   import { windowHooks } from "@ctrl/dom/internal";
//   windowHooks.getComputedStyle = (element, pseudo) => ...;

import type { Element } from "../nodes/Element.ts";
import type { Window } from "./Window.ts";

export interface MediaFeatureEnvironment {
  width: number;
  height: number;
  devicePixelRatio: number;
  /** "screen" for windows; "print" while printing (never, here). */
  mediaType: string;
  /** Per-window overrides from `createWindow({ mediaFeatures })`, e.g. { "prefers-color-scheme": "dark" }. */
  features: Record<string, string | number> | null;
}

export interface WindowHooks {
  /** css: https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle */
  getComputedStyle: ((element: Element, pseudoElement: string | null | undefined, window: Window) => unknown) | null;
  /** css: evaluate a media query list (https://drafts.csswg.org/mediaqueries/#evaluating) against `env`. */
  evaluateMediaQuery: ((query: string, env: MediaFeatureEnvironment) => boolean) | null;
  /** html-elements: create the window's CustomElementRegistry on first `window.customElements` access. */
  createCustomElementRegistry: ((window: Window) => unknown) | null;
  /** css: how computed colors serialize ("specified" keeps the author's text, "rgb" resolves). */
  setComputedColorMode: ((mode: "specified" | "rgb") => void) | null;
}

export const windowHooks: WindowHooks = {
  getComputedStyle: null,
  evaluateMediaQuery: null,
  createCustomElementRegistry: null,
  setComputedColorMode: null,
};
