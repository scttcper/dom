// jsdom's "Not implemented" diagnostics, reproduced in the jsdom compat profiles.
// jsdom 26: https://github.com/jsdom/jsdom/blob/26.1.0/lib/jsdom/browser/not-implemented.js
// jsdom 30: https://github.com/jsdom/jsdom/blob/30.1.3/lib/jsdom/browser/not-implemented.js
//
// jsdom reports what it does not implement (navigation to another document, the window methods
// it stubs, media playback, form submission, getComputedStyle with a pseudo-element) as a
// "jsdomError" on its virtual console. jest-environment-jsdom and Vitest's jsdom environment
// forward it to console.error, and suites assert on it (Sentry: "JSDOM throws an error on
// navigation", `message: 'Not implemented: navigation to another Document'`).
//
// Under the "jsdom-26" and "jsdom-30" profiles @ctrl/dom builds the same Error (message and
// `type`) at the same points and hands it to the handler an environment installs
// (setNotImplementedHandler), which forwards it the way that environment's jsdom counterpart
// does. There is no handler by default, and "modern" never reports. What @ctrl/dom itself does at
// those points is unchanged: it often implements the operation jsdom only stubs.

import type { CompatProfile } from "./compat.ts";
import { $options } from "../keys.ts";

export interface NotImplementedError extends Error {
  /** "not implemented" (jsdom 26) or "not-implemented" (jsdom 30), as jsdom sets it. */
  type: string;
}

/** Receives each diagnostic, with the profile that produced it (environments forward per jsdom version). */
export type NotImplementedHandler = (error: NotImplementedError, compat: "jsdom-26" | "jsdom-30") => void;

let handler: NotImplementedHandler | null = null;

/** Install (or with null, remove) the receiver of jsdom-profile "Not implemented" diagnostics. */
export function setNotImplementedHandler(next: NotImplementedHandler | null): void {
  handler = next;
}

/** Whether a report would go anywhere (lets callers skip the work of deciding). */
export function notImplementedActive(): boolean {
  return handler !== null;
}

/** An operation jsdom reports: its jsdom 26 wording, then its jsdom 30 wording. */
export type Operation = readonly [string, string];

/** https://github.com/jsdom/jsdom/blob/30.1.3/lib/jsdom/living/window/navigation.js (navigateFetch) */
export const NAVIGATION: Operation = ["navigation (except hash changes)", "navigation to another Document"];

/** jsdom's getComputedStyle with a non-empty pseudoElt (the pseudo-element is ignored there). */
export const COMPUTED_STYLE_PSEUDO: Operation = [
  "window.getComputedStyle(elt, pseudoElt)",
  "Window's getComputedStyle() method: with pseudo-elements",
];

/**
 * A method jsdom stubs: "window.alert", "HTMLMediaElement.prototype.play" in jsdom 26;
 * "Window's alert() method", "HTMLMediaElement's play() method" in jsdom 30 (notImplementedMethod).
 */
export function stubbedMethod(iface: string, name: string): Operation {
  return [iface === "Window" ? `window.${name}` : `${iface}.prototype.${name}`, `${iface}'s ${name}() method`];
}

/** Report `operation` for `window` (a Window, or null for a document without one, which jsdom skips too). */
export function reportNotImplemented(window: object | null, operation: Operation): void {
  if (handler === null || window === null) return;
  const compat = (window as { [$options]?: { compat: CompatProfile } })[$options]?.compat;
  if (compat !== "jsdom-26" && compat !== "jsdom-30") return;
  const jsdom26 = compat === "jsdom-26";
  const error = new Error(`Not implemented: ${jsdom26 ? operation[0] : operation[1]}`) as NotImplementedError;
  error.type = jsdom26 ? "not implemented" : "not-implemented";
  handler(error, compat);
}
