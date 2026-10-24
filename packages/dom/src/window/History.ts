// https://html.spec.whatwg.org/#the-history-interface
// https://html.spec.whatwg.org/#navigate (only the parts that apply without loading documents)
//
// One session history per window: a list of same-document entries. pushState/replaceState are
// synchronous; traversal (back/forward/go) is queued as a task like in browsers and fires
// `popstate` (then, in a separate task, `hashchange` when only the fragment changed).

import { eventInterface } from "./interfaces.ts";
import { NAVIGATION, reportNotImplemented } from "./not-implemented.ts";
import type { Window } from "./Window.ts";
import { $closed, $entries, $index, $scrollRestoration, $url, $window } from "../keys.ts";

interface SessionHistoryEntry {
  url: string;
  /** StructuredSerialize(data) result; we keep the structured clone itself. */
  state: unknown;
}

/**
 * Every History member starts with "If this's relevant global object's associated Document is not
 * fully active, then throw a SecurityError DOMException"
 * (https://html.spec.whatwg.org/#fully-active). A closed window (an iframe that was removed,
 * or a window after teardown) has no active document.
 */
function checkFullyActive(history: History, member: string): void {
  if (history[$window][$closed]) {
    throw new DOMException(`Failed to ${member} 'History': May not use a History object associated with a Document that is not fully active`, "SecurityError");
  }
}

function withoutFragment(href: string): string {
  const i = href.indexOf("#");
  return i === -1 ? href : href.slice(0, i);
}

export class History {
  [$window]: Window;
  [$entries]: SessionHistoryEntry[];
  [$index]: number;
  [$scrollRestoration]: "auto" | "manual";

  constructor(window: Window) {
    this[$window] = window;
    this[$entries] = [{ url: window[$url].href, state: null }];
    this[$index] = 0;
    this[$scrollRestoration] = "auto";
  }

  /** https://html.spec.whatwg.org/#dom-history-length */
  get length(): number {
    checkFullyActive(this, "read the 'length' property from");
    return this[$entries].length;
  }

  /** https://html.spec.whatwg.org/#dom-history-state */
  get state(): unknown {
    checkFullyActive(this, "read the 'state' property from");
    return this[$entries][this[$index]].state;
  }

  get scrollRestoration(): "auto" | "manual" {
    checkFullyActive(this, "read the 'scrollRestoration' property from");
    return this[$scrollRestoration];
  }

  set scrollRestoration(value: string) {
    checkFullyActive(this, "set the 'scrollRestoration' property on");
    if (value === "auto" || value === "manual") this[$scrollRestoration] = value;
  }

  /** https://html.spec.whatwg.org/#dom-history-go */
  go(delta = 0): void {
    checkFullyActive(this, "execute 'go' on");
    const d = Math.trunc(Number(delta)) || 0;
    // Step 4: a delta of 0 reloads; there is nothing to reload.
    if (d === 0) return;
    // https://html.spec.whatwg.org/#traverse-the-history-by-a-delta — queued; the target step is
    // computed when the task runs, and out-of-range deltas do nothing.
    this[$window]._task(() => {
      const target = this[$index] + d;
      if (target < 0 || target >= this[$entries].length) return;
      this._traverseTo(target);
    }, 0);
  }

  /** https://html.spec.whatwg.org/#dom-history-back */
  back(): void {
    checkFullyActive(this, "execute 'back' on");
    this.go(-1);
  }

  /** https://html.spec.whatwg.org/#dom-history-forward */
  forward(): void {
    checkFullyActive(this, "execute 'forward' on");
    this.go(1);
  }

  /** https://html.spec.whatwg.org/#dom-history-pushstate */
  pushState(data: unknown, unused: string, url?: string | URL | null): void {
    this._sharedPushReplaceState(data, url, false, "pushState");
  }

  /** https://html.spec.whatwg.org/#dom-history-replacestate */
  replaceState(data: unknown, unused: string, url?: string | URL | null): void {
    this._sharedPushReplaceState(data, url, true, "replaceState");
  }

  /** https://html.spec.whatwg.org/#shared-history-push/replace-state-steps */
  _sharedPushReplaceState(data: unknown, url: string | URL | null | undefined, replace: boolean, method: string): void {
    const window = this[$window];
    // Step 2: the document must be fully active.
    checkFullyActive(this, `execute '${method}' on`);
    // Step 4: serialize first (throws DataCloneError for functions, DOM nodes, ...).
    const state = data === undefined || data === null ? null : structuredClone(data);
    let newURL = window[$url];
    // Step 6: "If url is not null or the empty string" — `pushState(s, "", "")` keeps the
    // current URL, fragment included (https://github.com/whatwg/html/issues/9343).
    if (url !== undefined && url !== null && url !== "") {
      // Step 6.1-6.2: parse relative to the document's URL.
      const parsed = URL.parse(String(url), window[$url].href);
      if (parsed === null) {
        throw new DOMException(`Failed to execute '${method}' on 'History': A history state object with URL '${String(url)}' cannot be created.`, "SecurityError");
      }
      // Step 6.3: https://html.spec.whatwg.org/#can-have-its-url-rewritten
      if (!canHaveURLRewritten(window[$url], parsed)) {
        throw new DOMException(
          `Failed to execute '${method}' on 'History': A history state object with URL '${parsed.href}' cannot be created in a document with origin '${window[$url].origin}' and URL '${window[$url].href}'.`,
          "SecurityError",
        );
      }
      newURL = parsed;
    }
    const entry: SessionHistoryEntry = { url: newURL.href, state };
    if (replace) {
      this[$entries][this[$index]] = entry;
    } else {
      this[$entries].length = this[$index] + 1;
      this[$entries].push(entry);
      this[$index]++;
    }
    window._setURL(newURL);
  }

  /**
   * Location navigations (https://html.spec.whatwg.org/#navigate): no document is loaded. A
   * navigation that only changes the fragment is a fragment navigation and fires
   * `hashchange`; any other navigation just updates the URL (docs/deviations.md).
   */
  _navigate(url: URL, replace: boolean): void {
    const window = this[$window];
    const oldURL = window[$url].href;
    const newURL = url.href;
    // jsdom (living/window/navigation.js, navigate): a URL that differs beyond its fragment,
    // other than javascript:, is a navigation to another document, which it reports.
    if (url.protocol !== "javascript:" && withoutFragment(oldURL) !== withoutFragment(newURL)) reportNotImplemented(window, NAVIGATION);
    // https://html.spec.whatwg.org/#navigate step 12: navigating to the current URL replaces.
    if (newURL === oldURL) replace = true;
    const entry: SessionHistoryEntry = { url: newURL, state: null };
    if (replace) {
      this[$entries][this[$index]] = entry;
    } else {
      this[$entries].length = this[$index] + 1;
      this[$entries].push(entry);
      this[$index]++;
    }
    window._setURL(url);
    // https://html.spec.whatwg.org/#scroll-to-fragid — fragment navigations fire hashchange.
    if (url.hash !== "" || newURL.endsWith("#")) {
      if (withoutFragment(oldURL) === withoutFragment(newURL) && oldURL !== newURL) this._queueHashChange(oldURL, newURL);
    }
  }

  /** https://html.spec.whatwg.org/#update-document-for-history-step-application (same-document case) */
  _traverseTo(target: number): void {
    const window = this[$window];
    const oldURL = window[$url].href;
    this[$index] = target;
    const entry = this[$entries][target];
    if (entry.url !== oldURL) window._setURL(new URL(entry.url));
    const PopStateEvent = eventInterface("PopStateEvent");
    window.dispatchEvent(new PopStateEvent("popstate", { state: entry.state }) as never);
    if (oldURL !== entry.url && withoutFragment(oldURL) === withoutFragment(entry.url)) this._queueHashChange(oldURL, entry.url);
  }

  _queueHashChange(oldURL: string, newURL: string): void {
    const window = this[$window];
    window._task(() => {
      const HashChangeEvent = eventInterface("HashChangeEvent");
      window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }) as never);
    }, 0);
  }

  get [Symbol.toStringTag](): string {
    return "History";
  }
}

/** https://html.spec.whatwg.org/#can-have-its-url-rewritten */
function canHaveURLRewritten(documentURL: URL, targetURL: URL): boolean {
  if (
    documentURL.protocol !== targetURL.protocol ||
    documentURL.username !== targetURL.username ||
    documentURL.password !== targetURL.password ||
    documentURL.host !== targetURL.host
  ) {
    return false;
  }
  if (targetURL.protocol === "http:" || targetURL.protocol === "https:") return true;
  if (targetURL.protocol === "file:") return documentURL.pathname === targetURL.pathname;
  return withoutFragment(documentURL.href).split("?")[0] === withoutFragment(targetURL.href).split("?")[0];
}
