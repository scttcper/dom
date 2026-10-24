// <a> and <area>: HTMLHyperlinkElementUtils and hyperlink activation.
// https://html.spec.whatwg.org/#htmlhyperlinkelementutils
// https://html.spec.whatwg.org/#the-a-element
// https://html.spec.whatwg.org/#the-area-element
//
// Activation (click) never navigates (docs/deviations.md). A link to a fragment of the current
// document updates `location.hash` through the window, which fires `hashchange` when the
// window supports it; every other link is a no-op.

import { HTMLElement } from "./HTMLElement.ts";
import { bool, contentAttr, enumerated, REFERRER_POLICY, str, tokenList } from "./reflect.ts";
import { setAttribute } from "../nodes/attributes.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Event } from "../events/Event.ts";
import { nextInTree } from "../nodes/traverse.ts";
import { TEXT_NODE, CDATA_SECTION_NODE, F_CONNECTED } from "../nodes/constants.ts";
import { querySelector } from "../selectors/index.ts";
import { NAVIGATION, notImplementedActive, reportNotImplemented } from "../window/not-implemented.ts";
import { $impl, $parentWindow, $url, $window } from "../keys.ts";

type Hyperlink = HTMLElement;

/** https://html.spec.whatwg.org/#concept-hyperlink-url-set — the parsed href, or null. */
function linkURL(impl: NodeImpl): URL | null {
  const href = contentAttr(impl, "href");
  if (href === null) return null;
  return URL.parse(href, impl.doc.baseURI);
}

/** https://html.spec.whatwg.org/#update-href */
function updateHref(impl: NodeImpl, u: URL): void {
  setAttribute(impl, "href", u.href);
}

const RELS = ["noreferrer", "noopener", "opener"] as const;

/** Install HTMLHyperlinkElementUtils on `C`. */
function installHyperlinkUtils(C: { prototype: object }): void {
  const proto = C.prototype;
  const define = (name: string, get: (u: URL | null, impl: NodeImpl) => string, set?: (u: URL, v: string) => boolean) => {
    Object.defineProperty(proto, name, {
      get(this: Hyperlink) {
        const impl = this[$impl];
        return get(linkURL(impl), impl);
      },
      set: set
        ? function (this: Hyperlink, v: unknown) {
            const impl = this[$impl];
            const u = linkURL(impl);
            if (u === null) return;
            if (set(u, String(v))) updateHref(impl, u);
          }
        : undefined,
      configurable: true,
      enumerable: true,
    });
  };
  // https://html.spec.whatwg.org/#dom-hyperlink-href
  Object.defineProperty(proto, "href", {
    get(this: Hyperlink) {
      const impl = this[$impl];
      const href = contentAttr(impl, "href");
      if (href === null) return "";
      const u = URL.parse(href, impl.doc.baseURI);
      return u === null ? href : u.href;
    },
    set(this: Hyperlink, v: unknown) {
      setAttribute(this[$impl], "href", String(v));
    },
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(proto, "toString", {
    value: function toString(this: Hyperlink) {
      return (this as unknown as { href: string }).href;
    },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  define("origin", (u) => (u === null ? "" : u.origin));
  define(
    "protocol",
    (u) => (u === null ? ":" : u.protocol),
    (u, v) => {
      u.protocol = v + ":";
      return true;
    },
  );
  define(
    "username",
    (u) => (u === null ? "" : u.username),
    (u, v) => {
      if (u.host === "" || u.protocol === "file:") return false;
      u.username = v;
      return true;
    },
  );
  define(
    "password",
    (u) => (u === null ? "" : u.password),
    (u, v) => {
      if (u.host === "" || u.protocol === "file:") return false;
      u.password = v;
      return true;
    },
  );
  define(
    "host",
    (u) => (u === null ? "" : u.host),
    (u, v) => {
      u.host = v;
      return true;
    },
  );
  define(
    "hostname",
    (u) => (u === null ? "" : u.hostname),
    (u, v) => {
      u.hostname = v;
      return true;
    },
  );
  define(
    "port",
    (u) => (u === null ? "" : u.port),
    (u, v) => {
      u.port = v;
      return true;
    },
  );
  define(
    "pathname",
    (u) => (u === null ? "" : u.pathname),
    (u, v) => {
      u.pathname = v;
      return true;
    },
  );
  define(
    "search",
    (u) => (u === null ? "" : u.search),
    (u, v) => {
      u.search = v;
      return true;
    },
  );
  define(
    "hash",
    (u) => (u === null ? "" : u.hash),
    (u, v) => {
      u.hash = v;
      return true;
    },
  );
}

/**
 * https://html.spec.whatwg.org/#following-hyperlinks-2 — only same-document fragment
 * navigation is emulated (via the window's location); nothing else happens.
 */
function followHyperlink(el: Hyperlink): void {
  const impl = el[$impl];
  const u = linkURL(impl);
  if (u === null) return;
  const window = impl.doc[$window] as unknown as { location?: { hash: string; href: string } } | null;
  if (window === null || window.location === undefined) return;
  const target = contentAttr(impl, "target");
  if (target !== null && target !== "" && target.toLowerCase() !== "_self") return;
  if (contentAttr(impl, "download") !== null) return;
  const current = URL.parse(impl.doc.URL);
  if (current === null) return;
  const a = new URL(u.href);
  a.hash = "";
  current.hash = "";
  if (a.href !== current.href || u.href.indexOf("#") === -1) return;
  try {
    window.location.hash = u.hash;
  } catch {
    // The window's location may not support fragment navigation yet.
  }
}

interface LinkWindow {
  [$parentWindow]: LinkWindow | null;
  [$url]: URL;
  _task(callback: () => void, delay: number): unknown;
}

/**
 * jsdom-profile diagnostic (window/not-implemented.ts). jsdom follows an activated hyperlink
 * whose target is "", _self, _parent or _top (it ignores `download` and creates no browsing
 * context for other names) in a task, and its navigate() reports anything beyond a fragment
 * change of that window's document, except javascript: URLs.
 * https://github.com/jsdom/jsdom/blob/30.1.3/lib/jsdom/living/nodes/HTMLHyperlinkElementUtils-impl.js (_followAHyperlink)
 */
function reportFollowedHyperlink(impl: NodeImpl): void {
  if (!notImplementedActive()) return;
  // _cannotNavigate: an element other than <a> that is not connected.
  if (impl.name !== "a" && (impl.flags & F_CONNECTED) === 0) return;
  const source = impl.doc[$window] as unknown as LinkWindow | null;
  if (source === null) return;
  // _getAnElementsTarget: the target attribute, else the first <base target>'s.
  let target = contentAttr(impl, "target");
  if (target === null) {
    const base = querySelector(impl.doc[$impl], "base[target]");
    target = base === null ? "" : (contentAttr(base, "target") ?? "");
  }
  const name = target.toLowerCase();
  let chosen: LinkWindow | null = null;
  if (name === "" || name === "_self") chosen = source;
  else if (name === "_parent") chosen = source[$parentWindow] ?? source;
  else if (name === "_top") for (chosen = source; chosen[$parentWindow] !== null; ) chosen = chosen[$parentWindow];
  if (chosen === null) return;
  const url = linkURL(impl);
  if (url === null || url.protocol === "javascript:") return;
  const into = chosen;
  source._task(() => {
    const current = new URL(into[$url].href);
    const next = new URL(url.href);
    current.hash = "";
    next.hash = "";
    if (current.href !== next.href) reportNotImplemented(into, NAVIGATION);
  }, 0);
}

/** https://html.spec.whatwg.org/#htmlanchorelement */
export class HTMLAnchorElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-a-text */
  get text(): string {
    const root = this[$impl];
    let s = "";
    for (let n = root.first; n !== null; n = nextInTree(n, root)) if (n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE) s += n.data;
    return s;
  }

  set text(value: string) {
    this.textContent = value;
  }

  /** https://html.spec.whatwg.org/#the-a-element:activation-behaviour */
  get _hasActivationBehavior(): boolean {
    return contentAttr(this[$impl], "href") !== null;
  }

  _activationBehavior(_event: Event): void {
    if (contentAttr(this[$impl], "href") === null) return;
    followHyperlink(this);
    reportFollowedHyperlink(this[$impl]);
  }
}
installHyperlinkUtils(HTMLAnchorElement);
str(HTMLAnchorElement, "target download ping rel hreflang type coords charset name rev shape");
tokenList(HTMLAnchorElement, "relList", "rel", RELS);
enumerated(HTMLAnchorElement, "referrerPolicy=referrerpolicy", REFERRER_POLICY);

/** https://html.spec.whatwg.org/#htmlareaelement */
export class HTMLAreaElement extends HTMLElement {
  get _hasActivationBehavior(): boolean {
    return contentAttr(this[$impl], "href") !== null;
  }

  _activationBehavior(_event: Event): void {
    if (contentAttr(this[$impl], "href") === null) return;
    followHyperlink(this);
    reportFollowedHyperlink(this[$impl]);
  }
}
installHyperlinkUtils(HTMLAreaElement);
str(HTMLAreaElement, "alt coords shape target download ping rel hreflang type");
tokenList(HTMLAreaElement, "relList", "rel", RELS);
enumerated(HTMLAreaElement, "referrerPolicy=referrerpolicy", REFERRER_POLICY);
bool(HTMLAreaElement, "noHref=nohref");
