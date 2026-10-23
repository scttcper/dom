// https://html.spec.whatwg.org/#the-location-interface
//
// Backed by the window's URL (Node's WHATWG URL). Navigations never load anything: they
// update the URL and the session history (docs/deviations.md). Fragment navigations fire
// `hashchange` asynchronously, like browsers.

import type { Window } from "./Window.ts";
import { $url, $window } from "../keys.ts";

/** https://html.spec.whatwg.org/#location-object-navigate-ish — parse relative to the document URL. */
function parseURL(window: Window, url: string): URL {
  const parsed = URL.parse(String(url), window[$url].href);
  if (parsed === null) throw new DOMException(`Failed to execute 'assign' on 'Location': '${url}' is not a valid URL.`, "SyntaxError");
  return parsed;
}

export class Location {
  [$window]: Window;

  constructor(window: Window) {
    this[$window] = window;
  }

  /** https://html.spec.whatwg.org/#dom-location-href */
  get href(): string {
    return this[$window][$url].href;
  }

  set href(value: string) {
    this[$window]._navigate(parseURL(this[$window], value), false);
  }

  toString(): string {
    return this[$window][$url].href;
  }

  valueOf(): this {
    return this;
  }

  get origin(): string {
    return this[$window][$url].origin;
  }

  get protocol(): string {
    return this[$window][$url].protocol;
  }

  /** https://html.spec.whatwg.org/#dom-location-protocol (setter steps 4-6) */
  set protocol(value: string) {
    const copy = new URL(this[$window][$url].href);
    copy.protocol = String(value);
    if (copy.protocol !== "http:" && copy.protocol !== "https:") return;
    this[$window]._navigate(copy, false);
  }

  get host(): string {
    return this[$window][$url].host;
  }

  set host(value: string) {
    this._set("host", value);
  }

  get hostname(): string {
    return this[$window][$url].hostname;
  }

  set hostname(value: string) {
    this._set("hostname", value);
  }

  get port(): string {
    return this[$window][$url].port;
  }

  set port(value: string) {
    this._set("port", value);
  }

  get pathname(): string {
    return this[$window][$url].pathname;
  }

  set pathname(value: string) {
    this._set("pathname", value);
  }

  get search(): string {
    return this[$window][$url].search;
  }

  set search(value: string) {
    this._set("search", value);
  }

  get hash(): string {
    return this[$window][$url].hash;
  }

  /** https://html.spec.whatwg.org/#dom-location-hash (steps 3-6) */
  set hash(value: string) {
    const copy = new URL(this[$window][$url].href);
    let input = String(value);
    if (input.startsWith("#")) input = input.slice(1);
    copy.hash = input;
    // Step 6: if copyURL's fragment equals this's url's fragment, return.
    // Only the fragment differs between the two, so comparing hrefs compares fragments
    // (including null vs. empty).
    if (copy.href === this[$window][$url].href) return;
    this[$window]._navigate(copy, false);
  }

  get ancestorOrigins(): readonly string[] {
    return [];
  }

  /** https://html.spec.whatwg.org/#dom-location-assign */
  assign(url: string): void {
    this[$window]._navigate(parseURL(this[$window], url), false);
  }

  /** https://html.spec.whatwg.org/#dom-location-replace */
  replace(url: string): void {
    this[$window]._navigate(parseURL(this[$window], url), true);
  }

  /** https://html.spec.whatwg.org/#dom-location-reload — no-op: there is nothing to reload. */
  reload(): void {}

  _set(component: "host" | "hostname" | "port" | "pathname" | "search", value: string): void {
    const copy = new URL(this[$window][$url].href);
    copy[component] = String(value);
    this[$window]._navigate(copy, false);
  }

  get [Symbol.toStringTag](): string {
    return "Location";
  }
}
