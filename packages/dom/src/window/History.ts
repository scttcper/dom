// https://html.spec.whatwg.org/#the-history-interface
// https://html.spec.whatwg.org/#navigate (only the parts that apply without loading documents)
//
// One session history per window: a list of same-document entries. pushState/replaceState are
// synchronous; traversal (back/forward/go) is queued as a task like in browsers and fires
// `popstate` (then, in a separate task, `hashchange` when only the fragment changed).

import { eventInterface } from "./interfaces.ts";
import type { Window } from "./Window.ts";

interface SessionHistoryEntry {
  url: string;
  /** StructuredSerialize(data) result; we keep the structured clone itself. */
  state: unknown;
}

function withoutFragment(href: string): string {
  const i = href.indexOf("#");
  return i === -1 ? href : href.slice(0, i);
}

export class History {
  _window: Window;
  _entries: SessionHistoryEntry[];
  _index: number;
  _scrollRestoration: "auto" | "manual";

  constructor(window: Window) {
    this._window = window;
    this._entries = [{ url: window._url.href, state: null }];
    this._index = 0;
    this._scrollRestoration = "auto";
  }

  /** https://html.spec.whatwg.org/#dom-history-length */
  get length(): number {
    return this._entries.length;
  }

  /** https://html.spec.whatwg.org/#dom-history-state */
  get state(): unknown {
    return this._entries[this._index].state;
  }

  get scrollRestoration(): "auto" | "manual" {
    return this._scrollRestoration;
  }

  set scrollRestoration(value: string) {
    if (value === "auto" || value === "manual") this._scrollRestoration = value;
  }

  /** https://html.spec.whatwg.org/#dom-history-go */
  go(delta = 0): void {
    const d = Math.trunc(Number(delta)) || 0;
    // Step 4: a delta of 0 reloads; there is nothing to reload.
    if (d === 0) return;
    // https://html.spec.whatwg.org/#traverse-the-history-by-a-delta — queued; the target step is
    // computed when the task runs, and out-of-range deltas do nothing.
    this._window._task(() => {
      const target = this._index + d;
      if (target < 0 || target >= this._entries.length) return;
      this._traverseTo(target);
    }, 0);
  }

  back(): void {
    this.go(-1);
  }

  forward(): void {
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
    const window = this._window;
    // Step 4: serialize first (throws DataCloneError for functions, DOM nodes, ...).
    const state = data === undefined || data === null ? null : structuredClone(data);
    let newURL = window._url;
    if (url !== undefined && url !== null) {
      // Step 6.1-6.2: parse relative to the document's URL.
      const parsed = URL.parse(String(url), window._url.href);
      if (parsed === null) {
        throw new DOMException(`Failed to execute '${method}' on 'History': A history state object with URL '${String(url)}' cannot be created.`, "SecurityError");
      }
      // Step 6.3: https://html.spec.whatwg.org/#can-have-its-url-rewritten
      if (!canHaveURLRewritten(window._url, parsed)) {
        throw new DOMException(
          `Failed to execute '${method}' on 'History': A history state object with URL '${parsed.href}' cannot be created in a document with origin '${window._url.origin}' and URL '${window._url.href}'.`,
          "SecurityError",
        );
      }
      newURL = parsed;
    }
    const entry: SessionHistoryEntry = { url: newURL.href, state };
    if (replace) {
      this._entries[this._index] = entry;
    } else {
      this._entries.length = this._index + 1;
      this._entries.push(entry);
      this._index++;
    }
    window._setURL(newURL);
  }

  /**
   * Location navigations (https://html.spec.whatwg.org/#navigate): no document is loaded. A
   * navigation that only changes the fragment is a fragment navigation and fires
   * `hashchange`; any other navigation just updates the URL (docs/deviations.md).
   */
  _navigate(url: URL, replace: boolean): void {
    const window = this._window;
    const oldURL = window._url.href;
    const newURL = url.href;
    // https://html.spec.whatwg.org/#navigate step 12: navigating to the current URL replaces.
    if (newURL === oldURL) replace = true;
    const entry: SessionHistoryEntry = { url: newURL, state: null };
    if (replace) {
      this._entries[this._index] = entry;
    } else {
      this._entries.length = this._index + 1;
      this._entries.push(entry);
      this._index++;
    }
    window._setURL(url);
    // https://html.spec.whatwg.org/#scroll-to-fragid — fragment navigations fire hashchange.
    if (url.hash !== "" || newURL.endsWith("#")) {
      if (withoutFragment(oldURL) === withoutFragment(newURL) && oldURL !== newURL) this._queueHashChange(oldURL, newURL);
    }
  }

  /** https://html.spec.whatwg.org/#update-document-for-history-step-application (same-document case) */
  _traverseTo(target: number): void {
    const window = this._window;
    const oldURL = window._url.href;
    this._index = target;
    const entry = this._entries[target];
    if (entry.url !== oldURL) window._setURL(new URL(entry.url));
    const PopStateEvent = eventInterface("PopStateEvent");
    window.dispatchEvent(new PopStateEvent("popstate", { state: entry.state }) as never);
    if (oldURL !== entry.url && withoutFragment(oldURL) === withoutFragment(entry.url)) this._queueHashChange(oldURL, entry.url);
  }

  _queueHashChange(oldURL: string, newURL: string): void {
    const window = this._window;
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
