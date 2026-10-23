// https://html.spec.whatwg.org/#the-location-interface
//
// Backed by the window's URL (Node's WHATWG URL). Navigations never load anything: they
// update the URL and the session history (docs/deviations.md). Fragment navigations fire
// `hashchange` asynchronously, like browsers.

import type { Window } from "./Window.ts";
import { type DOMStringList, createDOMStringList } from "./DOMStringList.ts";
import { windowOrigin } from "./origin.ts";
import { $closed, $parentWindow, $url, $window } from "../keys.ts";

/** https://html.spec.whatwg.org/#location-object-navigate-ish — parse relative to the document URL. */
function parseURL(window: Window, url: string): URL {
  const parsed = URL.parse(String(url), window[$url].href);
  if (parsed === null) throw new DOMException(`Failed to execute 'assign' on 'Location': '${url}' is not a valid URL.`, "SyntaxError");
  return parsed;
}

/**
 * https://html.spec.whatwg.org/#location-object-setup-steps steps 3-4 and the [LegacyUnforgeable]
 * stringifier: `valueOf` (%Object.prototype.valueOf%), `@@toPrimitive` (undefined) and
 * `toString` are own, non-configurable properties of every Location object.
 *
 * Deviation (docs/deviations.md): the other members (href, assign, replace, reload, ...) stay on
 * Location.prototype as ordinary configurable properties instead of [LegacyUnforgeable] own
 * ones, so `vi.spyOn(location, "assign")` works.
 */
const UNFORGEABLE: PropertyDescriptorMap = {
  toString: {
    value: function toString(this: Location): string {
      return this[$window][$url].href;
    },
    writable: false,
    enumerable: true,
    configurable: false,
  },
  valueOf: { value: Object.prototype.valueOf, writable: false, enumerable: false, configurable: false },
  [Symbol.toPrimitive]: { value: undefined, writable: false, enumerable: false, configurable: false },
};

/**
 * A Location whose relevant Document is null (its browsing context was discarded, i.e. the
 * window is closed): every setter and method returns early ("If this's relevant Document is
 * null, then return", step 1 of each).
 */
function inactive(location: Location): boolean {
  return location[$window][$closed];
}

/**
 * https://html.spec.whatwg.org/#dom-location-protocol step 3: basic URL parsing `value + ":"`
 * with scheme start state override fails unless, after removing ASCII tab or newline, the input
 * starts with an ASCII alpha followed by ASCII alphanumerics, "+", "-" or "." up to the first ":"
 * (https://url.spec.whatwg.org/#scheme-start-state, https://url.spec.whatwg.org/#scheme-state).
 */
function isSchemeInput(value: string): boolean {
  const input = value.replace(/[\t\n\r]/g, "") + ":";
  return /^[A-Za-z][A-Za-z0-9+\-.]*:/.test(input);
}

export class Location {
  [$window]: Window;
  #ancestorOrigins: DOMStringList | null = null;
  #detachedAncestorOrigins: DOMStringList | null = null;

  constructor(window: Window) {
    this[$window] = window;
    Object.defineProperties(this, UNFORGEABLE);
  }

  /** https://html.spec.whatwg.org/#dom-location-href */
  get href(): string {
    return this[$window][$url].href;
  }

  set href(value: string) {
    if (inactive(this)) return;
    this[$window]._navigate(parseURL(this[$window], value), false);
  }

  get origin(): string {
    return this[$window][$url].origin;
  }

  get protocol(): string {
    return this[$window][$url].protocol;
  }

  /** https://html.spec.whatwg.org/#dom-location-protocol (setter steps 4-6) */
  set protocol(value: string) {
    if (inactive(this)) return;
    const input = String(value);
    if (!isSchemeInput(input)) {
      throw new DOMException(`Failed to set the 'protocol' property on 'Location': '${input}' is an invalid protocol.`, "SyntaxError");
    }
    const copy = new URL(this[$window][$url].href);
    copy.protocol = input;
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

  /** https://html.spec.whatwg.org/#dom-location-hash */
  set hash(value: string) {
    if (inactive(this)) return;
    const url = this[$window][$url];
    // Step 4: thisURLFragment is the URL's fragment, or "" when it is null (URL#hash is "" for
    // both, else "#" + fragment).
    const thisURLFragment = url.hash.slice(1);
    let input = String(value);
    if (input.startsWith("#")) input = input.slice(1);
    // Steps 3, 5-6: copyURL's fragment is set to "" and then parsed from input in fragment
    // state, so an empty input leaves an empty (not null) fragment: the href keeps its "#"
    // (the URL API's hash setter would null it instead).
    let copy = new URL(url.href);
    copy.hash = input;
    if (input === "") copy = new URL(copy.href + "#");
    // Step 7: if copyURL's fragment is thisURLFragment, return (so "" on a URL without a
    // fragment does not navigate).
    if (copy.hash.slice(1) === thisURLFragment) return;
    this[$window]._navigate(copy, false);
  }

  /**
   * https://html.spec.whatwg.org/#dom-location-ancestororigins — the list is created once (the
   * Location's [[AncestorOriginsList]], https://html.spec.whatwg.org/#concept-location-ancestor-origins-list):
   * the origins of the parent, grandparent, ... browsing contexts. Once the browsing context is
   * gone (the window closed) a new, empty list is returned (step 1), also cached.
   */
  get ancestorOrigins(): DOMStringList {
    if (inactive(this)) return (this.#detachedAncestorOrigins ??= createDOMStringList([]));
    if (this.#ancestorOrigins === null) {
      const origins: string[] = [];
      for (let w = this[$window][$parentWindow]; w !== null; w = w[$parentWindow]) origins.push(windowOrigin(w));
      this.#ancestorOrigins = createDOMStringList(origins);
    }
    return this.#ancestorOrigins;
  }

  /** https://html.spec.whatwg.org/#dom-location-assign */
  assign(url: string): void {
    if (inactive(this)) return;
    this[$window]._navigate(parseURL(this[$window], url), false);
  }

  /** https://html.spec.whatwg.org/#dom-location-replace */
  replace(url: string): void {
    if (inactive(this)) return;
    this[$window]._navigate(parseURL(this[$window], url), true);
  }

  /** https://html.spec.whatwg.org/#dom-location-reload — no-op: there is nothing to reload. */
  reload(): void {}

  _set(component: "host" | "hostname" | "port" | "pathname" | "search", value: string): void {
    if (inactive(this)) return;
    const copy = new URL(this[$window][$url].href);
    copy[component] = String(value);
    this[$window]._navigate(copy, false);
  }

  get [Symbol.toStringTag](): string {
    return "Location";
  }
}
