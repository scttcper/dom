// Document members that depend on the browsing context / window rather than the node tree.
// Installed on Document.prototype from here so the window area owns their behavior; a member
// that the node layer already defines is left alone.
//
// https://html.spec.whatwg.org/#the-document-object

import { Document } from "../nodes/Document.ts";
import type { Location } from "./Location.ts";
import { documentParseHTMLUnsafe } from "./fallbacks.ts";
import { isDesignModeEnabled, setDesignModeEnabled } from "../html/shared.ts";
import { asciiLowercase } from "../nodes/attributes.ts";
import type { Window } from "./Window.ts";
import { $options, $url, $window } from "../keys.ts";

function windowOf(doc: Document): Window | null {
  return doc[$window];
}

const members: PropertyDescriptorMap = {
  /** https://html.spec.whatwg.org/#dom-document-cookie — cookie-averse documents return "". */
  cookie: {
    get(this: Document): string {
      const win = windowOf(this);
      return win === null ? "" : win._cookieStore.get(win[$url]);
    },
    set(this: Document, value: string) {
      const win = windowOf(this);
      if (win !== null) win._cookieStore.set(String(value), win[$url]);
    },
  },
  /** https://html.spec.whatwg.org/#dom-document-referrer */
  referrer: {
    get(this: Document): string {
      return windowOf(this)?.[$options].referrer ?? "";
    },
  },
  /**
   * https://html.spec.whatwg.org/#dom-document-currentscript — the script element being executed,
   * which is always null here: scripts never run (docs/deviations.md).
   */
  currentScript: {
    get(): null {
      return null;
    },
  },
  /** https://html.spec.whatwg.org/#dom-document-readystate — documents are fully loaded. */
  readyState: {
    get(): string {
      return "complete";
    },
  },
  /** https://html.spec.whatwg.org/#dom-document-visibilitystate */
  visibilityState: {
    get(): string {
      return "visible";
    },
  },
  /** https://html.spec.whatwg.org/#dom-document-hidden */
  hidden: {
    get(): boolean {
      return false;
    },
  },
  /** https://html.spec.whatwg.org/#dom-document-location */
  location: {
    get(this: Document): Location | null {
      return windowOf(this)?.location ?? null;
    },
    set(this: Document, value: string) {
      const win = windowOf(this);
      if (win !== null) win.location.href = value;
    },
  },
  /** https://html.spec.whatwg.org/#dom-document-lastmodified */
  lastModified: {
    get(): string {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },
  },
  /** https://html.spec.whatwg.org/#dom-document-domain */
  domain: {
    get(this: Document): string {
      return windowOf(this)?.[$url].hostname ?? "";
    },
    set() {},
  },
  /** https://html.spec.whatwg.org/#dom-document-designmode */
  designMode: {
    get(this: Document): string {
      return isDesignModeEnabled(this) ? "on" : "off";
    },
    set(this: Document, value: string) {
      // Step 1: ASCII case-insensitive "on" enables; step 2: "off" disables; other values do
      // nothing. No selection reset or focus change: there is no editing UI.
      const v = asciiLowercase(String(value));
      if (v === "on") setDesignModeEnabled(this, true);
      else if (v === "off") setDesignModeEnabled(this, false);
    },
  },
};

const proto = Document.prototype as unknown as Record<string, unknown>;
for (const name of Object.keys(members)) {
  if (name in proto) continue;
  Object.defineProperty(proto, name, { ...members[name], enumerable: true, configurable: true });
}

declare module "../nodes/Document.ts" {
  interface Document {
    cookie: string;
    readonly referrer: string;
    readonly currentScript: null;
    readonly readyState: DocumentReadyState;
    readonly visibilityState: DocumentVisibilityState;
    readonly hidden: boolean;
    get location(): Location | null;
    set location(value: string);
    readonly lastModified: string;
    domain: string;
    designMode: string;
  }
}

type DocumentReadyState = "loading" | "interactive" | "complete";
type DocumentVisibilityState = "visible" | "hidden";

// https://html.spec.whatwg.org/#dom-parsehtmlunsafe (static)
if (!Object.hasOwn(Document, "parseHTMLUnsafe")) {
  Object.defineProperty(Document, "parseHTMLUnsafe", {
    value: documentParseHTMLUnsafe,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
