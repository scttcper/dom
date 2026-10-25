/**
 * Window members component tests reach for: timers and their ordering against microtasks and
 * MessageChannel, animation frame and idle callbacks, structuredClone of DOM-adjacent values,
 * Web Storage, History and Location methods, Navigator, BarProp, origin / isSecureContext,
 * DOMStringList and customElements.
 *
 * Spec: HTML Standard
 *   - timers:                 https://html.spec.whatwg.org/#timers, https://html.spec.whatwg.org/#dom-setinterval,
 *                             https://html.spec.whatwg.org/#timer-initialisation-steps
 *   - event loop ordering:    https://html.spec.whatwg.org/#perform-a-microtask-checkpoint
 *   - message channels:       https://html.spec.whatwg.org/#message-channels
 *   - structured clone:       https://html.spec.whatwg.org/#dom-structuredclone, https://html.spec.whatwg.org/#structuredserializeinternal
 *   - animation frames:       https://html.spec.whatwg.org/#list-of-animation-frame-callbacks,
 *                             https://html.spec.whatwg.org/#animationframeprovider-cancelanimationframe
 *   - Web Storage:            https://html.spec.whatwg.org/#storage, https://html.spec.whatwg.org/#dom-localstorage,
 *                             https://html.spec.whatwg.org/#dom-sessionstorage, https://html.spec.whatwg.org/#session-storage-holder,
 *                             https://html.spec.whatwg.org/#navigable-top-level-traversable,
 *                             https://html.spec.whatwg.org/#dom-storage-length, https://html.spec.whatwg.org/#dom-storage-key,
 *                             https://html.spec.whatwg.org/#dom-storage-getitem, https://html.spec.whatwg.org/#dom-storage-setitem,
 *                             https://html.spec.whatwg.org/#dom-storage-removeitem, https://html.spec.whatwg.org/#dom-storage-clear
 *   - History:                https://html.spec.whatwg.org/#dom-history, https://html.spec.whatwg.org/#dom-history-back,
 *                             https://html.spec.whatwg.org/#dom-history-forward, https://html.spec.whatwg.org/#dom-history-replacestate,
 *                             https://html.spec.whatwg.org/#fully-active
 *   - Location:               https://html.spec.whatwg.org/#dom-location, https://html.spec.whatwg.org/#dom-location-assign,
 *                             https://html.spec.whatwg.org/#dom-location-replace, https://html.spec.whatwg.org/#dom-location-protocol,
 *                             https://html.spec.whatwg.org/#location-object-navigate-ish,
 *                             https://html.spec.whatwg.org/#dom-location-ancestororigins,
 *                             https://html.spec.whatwg.org/#concept-location-ancestor-origins-list
 *   - DOMStringList:          https://html.spec.whatwg.org/#the-domstringlist-interface, https://html.spec.whatwg.org/#dom-domstringlist-length,
 *                             https://html.spec.whatwg.org/#dom-domstringlist-item, https://html.spec.whatwg.org/#dom-domstringlist-contains
 *   - Navigator:              https://html.spec.whatwg.org/#dom-navigator, https://html.spec.whatwg.org/#navigatorid,
 *                             https://html.spec.whatwg.org/#navigatorlanguage, https://html.spec.whatwg.org/#navigatoronline,
 *                             https://html.spec.whatwg.org/#navigatorplugins, https://html.spec.whatwg.org/#navigatorcookies,
 *                             https://html.spec.whatwg.org/#navigatorconcurrenthardware, https://html.spec.whatwg.org/#the-useractivation-interface
 *   - BarProp:                https://html.spec.whatwg.org/#barprop
 *   - origins:                https://html.spec.whatwg.org/#dom-origin, https://html.spec.whatwg.org/#dom-issecurecontext,
 *                             https://html.spec.whatwg.org/#determining-the-origin, https://html.spec.whatwg.org/#concept-settings-object-origin
 *   - window.open:            https://html.spec.whatwg.org/#dom-open
 *   - customElements:         https://html.spec.whatwg.org/#dom-window-customelements
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
let win: any;
beforeEach(() => {
  win = createWindow({ url: "https://example.com/a/b?q#h" } as any);
});
afterEach(() => win.close());

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("timers — https://html.spec.whatwg.org/#timers", () => {
  test("handles are positive integers shared by setTimeout and setInterval: clearTimeout cancels an interval (https://html.spec.whatwg.org/#dom-setinterval)", async () => {
    let n = 0;
    const id = win.setInterval(() => n++, 1);
    const t = win.setTimeout(() => {}, 1);
    expect(id > 0 && t > 0 && t !== id).toBe(true);
    await delay(15);
    win.clearTimeout(id);
    const after = n;
    await delay(15);
    expect([after > 1, n]).toEqual([true, after]);
  });

  test("timers with the same timeout run in the order they were scheduled; microtasks run before any of them (https://html.spec.whatwg.org/#perform-a-microtask-checkpoint)", async () => {
    const log: string[] = [];
    win.setTimeout(() => log.push("t1"), 0);
    win.setTimeout(() => {
      log.push("t2");
      win.queueMicrotask(() => log.push("m-in-t2"));
    }, 0);
    win.setTimeout(() => log.push("t3"), 0);
    win.queueMicrotask(() => log.push("m1"));
    Promise.resolve().then(() => log.push("p1"));
    await delay(10);
    expect(log).toEqual(["m1", "p1", "t1", "t2", "m-in-t2", "t3"]);
  });

  test("extra arguments are passed to the callback; a negative or NaN timeout is 0 (https://html.spec.whatwg.org/#timer-initialisation-steps)", async () => {
    const got: unknown[] = [];
    win.setTimeout((a: number, b: string) => got.push(a, b), -5, 1, "x");
    win.setTimeout(() => got.push("nan"), Number.NaN);
    await delay(10);
    expect(got).toEqual([1, "x", "nan"]);
  });

  test("clearing an unknown, already-fired or non-numeric handle is a no-op", async () => {
    const id = win.setTimeout(() => {}, 0);
    await delay(5);
    expect(() => [win.clearTimeout(id), win.clearTimeout(999_999), win.clearInterval("x"), win.clearTimeout()]).not.toThrow();
  });
});

describe("MessageChannel — https://html.spec.whatwg.org/#message-channels", () => {
  test("messages arrive as MessageEvents after the current task's microtasks, in order, with structured-cloned data", async () => {
    const { port1, port2 } = new win.MessageChannel();
    const log: unknown[] = [];
    const sent = { a: [1, 2], d: new Date(0) };
    await new Promise<void>((resolve) => {
      port2.onmessage = (e: any) => {
        log.push(e.data);
        if (log.length === 3) resolve();
      };
      port1.postMessage(sent);
      port1.postMessage("second");
      Promise.resolve().then(() => log.push("microtask"));
    });
    port1.close();
    port2.close();
    expect(log[0]).toBe("microtask");
    expect(log[1]).toEqual(sent);
    expect(log[1]).not.toBe(sent);
    expect(log[2]).toBe("second");
  });
});

describe("structuredClone — https://html.spec.whatwg.org/#dom-structuredclone", () => {
  test("clones Maps, Sets, Dates, RegExps, typed arrays and cycles; functions throw DataCloneError (https://html.spec.whatwg.org/#structuredserializeinternal)", () => {
    const o: any = { m: new Map([[1, "a"]]), s: new Set([1]), d: new Date(5), r: /x/gi, u: new Uint8Array([1, 2]) };
    o.self = o;
    const c = win.structuredClone(o);
    expect([c.m.get(1), c.s.has(1), c.d.getTime(), c.r.flags, Array.from(c.u), c.self === c, c === o]).toEqual(["a", true, 5, "gi", [1, 2], true, false]);
    expect(() => win.structuredClone(() => {})).toThrow(expect.objectContaining({ name: "DataCloneError" }));
  });

  // structuredClone is the host's (Node's): it serializes our DOM wrappers as plain objects (their
  // internals are symbol-keyed, so the clone is `{}`) instead of throwing for a platform object
  // that is not [Serializable]. Detecting that needs a full walk of every cloned value before
  // handing it to Node, on every postMessage/history state too (docs/deviations.md, Window).
  test.fails("a DOM node is not serializable and throws DataCloneError (step 26: platform objects that are not [Serializable])", () => {
    expect(() => win.structuredClone(win.document.createElement("div"))).toThrow(expect.objectContaining({ name: "DataCloneError" }));
  });

  test("Blob and File clone with their bytes and metadata", async () => {
    const f = new win.File(["hey"], "a.txt", { type: "text/plain", lastModified: 7 });
    const c = win.structuredClone(f);
    expect([c instanceof win.File || c instanceof File, c.name, c.type, c.lastModified, await c.text()]).toEqual([true, "a.txt", "text/plain", 7, "hey"]);
  });
});

describe("animation frames — https://html.spec.whatwg.org/#list-of-animation-frame-callbacks", () => {
  test("callbacks of one frame share a timestamp and run in order; cancelAnimationFrame removes one (https://html.spec.whatwg.org/#animationframeprovider-cancelanimationframe)", async () => {
    const log: [string, number][] = [];
    win.requestAnimationFrame((t: number) => log.push(["a", t]));
    const b = win.requestAnimationFrame((t: number) => log.push(["b", t]));
    win.requestAnimationFrame((t: number) => log.push(["c", t]));
    win.cancelAnimationFrame(b);
    await delay(40);
    expect(log.map((l) => l[0])).toEqual(["a", "c"]);
    expect(log[0][1]).toBe(log[1][1]);
  });

  test("a callback requested during a frame runs in the next frame", async () => {
    const log: string[] = [];
    win.requestAnimationFrame(() => {
      log.push("a");
      win.requestAnimationFrame(() => log.push("nested"));
    });
    win.requestAnimationFrame(() => log.push("b"));
    await delay(60);
    expect(log).toEqual(["a", "b", "nested"]);
  });
});

describe("requestIdleCallback — https://w3c.github.io/requestidlecallback/#the-requestidlecallback-method", () => {
  test("the deadline reports didTimeout and a non-negative timeRemaining; cancelIdleCallback cancels", async () => {
    const log: unknown[] = [];
    win.requestIdleCallback((d: any) => log.push([typeof d.didTimeout, d.timeRemaining() >= 0]));
    const id = win.requestIdleCallback(() => log.push("cancelled"));
    win.cancelIdleCallback(id);
    await delay(80);
    expect(log).toEqual([["boolean", true]]);
  });
});

describe("Web Storage — https://html.spec.whatwg.org/#storage", () => {
  test("localStorage and sessionStorage are distinct Storage objects per window, the same on every access (https://html.spec.whatwg.org/#dom-localstorage, https://html.spec.whatwg.org/#dom-sessionstorage)", () => {
    expect([win.localStorage === win.localStorage, win.localStorage === win.sessionStorage, win.localStorage.constructor.name]).toEqual([true, false, "Storage"]);
  });

  test("setItem stringifies; key(n) and length follow insertion; removeItem and clear (https://html.spec.whatwg.org/#dom-storage-setitem, https://html.spec.whatwg.org/#dom-storage-key, https://html.spec.whatwg.org/#dom-storage-length, https://html.spec.whatwg.org/#dom-storage-getitem, https://html.spec.whatwg.org/#dom-storage-removeitem, https://html.spec.whatwg.org/#dom-storage-clear)", () => {
    const s = win.sessionStorage;
    s.setItem("a", 1);
    s.setItem("b", { toString: () => "B" });
    s.setItem("a", "2");
    const keys = [s.key(0), s.key(1), s.key(2)];
    const vals = [s.getItem("a"), s.getItem("b"), s.getItem("missing")];
    s.removeItem("a");
    const len = s.length;
    s.clear();
    expect([keys, vals, len, s.length]).toEqual([["a", "b", null], ["2", "B", null], 1, 0]);
  });

  test("a same-origin iframe shares its top-level traversable's session storage and the origin's local storage (https://html.spec.whatwg.org/#session-storage-holder, https://html.spec.whatwg.org/#navigable-top-level-traversable)", () => {
    const iframe = win.document.createElement("iframe");
    win.document.body.appendChild(iframe);
    win.localStorage.setItem("shared", "1");
    win.sessionStorage.setItem("session", "1");
    const inner = iframe.contentWindow;
    expect([inner.localStorage.getItem("shared"), inner.sessionStorage.getItem("session")]).toEqual(["1", "1"]);
  });

  test("separate createWindow() windows are separate user agents: nothing is shared (test isolation)", () => {
    const other: any = createWindow({ url: "https://example.com/other" } as any);
    try {
      win.localStorage.setItem("shared", "1");
      expect(other.localStorage.getItem("shared")).toBeNull();
    } finally {
      other.close();
    }
  });
});

describe("History — https://html.spec.whatwg.org/#dom-history", () => {
  test("replaceState replaces the current entry's state and URL without changing length (https://html.spec.whatwg.org/#dom-history-replacestate)", () => {
    const h = win.history;
    const len = h.length;
    h.replaceState({ x: 1 }, "", "/replaced?y");
    expect([h.length, h.state, win.location.pathname, win.location.search]).toEqual([len, { x: 1 }, "/replaced", "?y"]);
  });

  test("back() and forward() traverse asynchronously and fire popstate (https://html.spec.whatwg.org/#dom-history-back, https://html.spec.whatwg.org/#dom-history-forward)", async () => {
    const h = win.history;
    const pops: unknown[] = [];
    win.addEventListener("popstate", (e: any) => pops.push(e.state));
    h.pushState({ n: 1 }, "", "/one");
    h.pushState({ n: 2 }, "", "/two");
    h.back();
    expect(win.location.pathname).toBe("/two");
    await delay(20);
    const afterBack = win.location.pathname;
    h.forward();
    await delay(20);
    expect([afterBack, win.location.pathname, pops]).toEqual(["/one", "/two", [{ n: 1 }, { n: 2 }]]);
  });

  test("a closed window's history is not fully active: methods throw SecurityError (https://html.spec.whatwg.org/#fully-active)", () => {
    const w: any = createWindow();
    const h = w.history;
    w.close();
    expect(() => h.pushState(null, "")).toThrow(expect.objectContaining({ name: "SecurityError" }));
  });
});

describe("Location — https://html.spec.whatwg.org/#dom-location", () => {
  test("assign() and replace() of a fragment-only change update the URL; replace does not add a history entry (https://html.spec.whatwg.org/#dom-location-assign, https://html.spec.whatwg.org/#dom-location-replace, https://html.spec.whatwg.org/#location-object-navigate-ish)", () => {
    const len = win.history.length;
    win.location.assign("#one");
    const afterAssign = [win.location.hash, win.history.length];
    win.location.replace("#two");
    expect([afterAssign, win.location.hash, win.history.length]).toEqual([["#one", len + 1], "#two", len + 1]);
  });

  test("protocol setter: an invalid scheme throws SyntaxError (https://html.spec.whatwg.org/#dom-location-protocol)", () => {
    expect(() => (win.location.protocol = "1nvalid")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(win.location.protocol).toBe("https:");
  });

  test("ancestorOrigins is an empty DOMStringList for a top-level window (https://html.spec.whatwg.org/#dom-location-ancestororigins, https://html.spec.whatwg.org/#concept-location-ancestor-origins-list)", () => {
    const list = win.location.ancestorOrigins;
    expect([list.constructor.name, list.length, list === win.location.ancestorOrigins]).toEqual(["DOMStringList", 0, true]);
  });
});

describe("DOMStringList — https://html.spec.whatwg.org/#the-domstringlist-interface", () => {
  test("length, item(), indexed access and contains() of an iframe's ancestor origins (https://html.spec.whatwg.org/#dom-domstringlist-length, https://html.spec.whatwg.org/#dom-domstringlist-item, https://html.spec.whatwg.org/#dom-domstringlist-contains)", () => {
    const iframe = win.document.createElement("iframe");
    win.document.body.appendChild(iframe);
    const list = iframe.contentWindow.location.ancestorOrigins;
    expect([list.length, list.item(0), list[0], list.item(5), list.contains("https://example.com"), list.contains("https://other.test")]).toEqual([
      1, "https://example.com", "https://example.com", null, true, false,
    ]);
  });
});

describe("Navigator — https://html.spec.whatwg.org/#dom-navigator", () => {
  test("NavigatorID, NavigatorLanguage, NavigatorOnLine, NavigatorPlugins, NavigatorCookies, NavigatorConcurrentHardware (https://html.spec.whatwg.org/#navigatorid, https://html.spec.whatwg.org/#navigatorlanguage, https://html.spec.whatwg.org/#navigatoronline, https://html.spec.whatwg.org/#navigatorplugins, https://html.spec.whatwg.org/#navigatorcookies, https://html.spec.whatwg.org/#navigatorconcurrenthardware)", () => {
    const n = win.navigator;
    expect({
      same: n === win.navigator,
      appCodeName: n.appCodeName,
      appName: n.appName,
      product: n.product,
      ua: typeof n.userAgent,
      languageInLanguages: n.languages.includes(n.language),
      frozenLanguages: Object.isFrozen(n.languages),
      onLine: n.onLine,
      plugins: [n.plugins.length, n.mimeTypes.length, n.pdfViewerEnabled, n.javaEnabled()],
      cookieEnabled: n.cookieEnabled,
      cores: Number.isInteger(n.hardwareConcurrency) && n.hardwareConcurrency > 0,
    }).toEqual({
      same: true,
      appCodeName: "Mozilla",
      appName: "Netscape",
      product: "Gecko",
      ua: "string",
      languageInLanguages: true,
      frozenLanguages: true,
      onLine: true,
      plugins: [0, 0, false, false],
      cookieEnabled: true,
      cores: true,
    });
  });

  test("userActivation reports no activation (https://html.spec.whatwg.org/#the-useractivation-interface)", () => {
    expect([win.navigator.userActivation.hasBeenActive, win.navigator.userActivation.isActive]).toEqual([false, false]);
  });
});

describe("BarProp — https://html.spec.whatwg.org/#barprop", () => {
  test("every bar reports visible", () => {
    expect(["locationbar", "menubar", "personalbar", "scrollbars", "statusbar", "toolbar"].map((b) => win[b].visible)).toEqual([true, true, true, true, true, true]);
  });
});

describe("origins — https://html.spec.whatwg.org/#dom-origin", () => {
  test("window.origin and document origin serialize the document URL's origin (https://html.spec.whatwg.org/#determining-the-origin, https://html.spec.whatwg.org/#concept-settings-object-origin)", () => {
    expect([win.origin, win.location.origin]).toEqual(["https://example.com", "https://example.com"]);
  });

  test("isSecureContext: https, file, localhost names and loopback addresses are potentially trustworthy (https://html.spec.whatwg.org/#dom-issecurecontext)", () => {
    const secure = (url: string) => {
      const w: any = createWindow({ url } as any);
      try {
        return w.isSecureContext;
      } finally {
        w.close();
      }
    };
    expect(["https://x.test/", "http://x.test/", "http://localhost:3000/", "http://app.localhost/", "http://127.0.0.1/", "http://127.4.5.6/", "http://[::1]/", "file:///tmp/a.html"].map(secure)).toEqual([
      true, false, true, true, true, true, true, true,
    ]);
  });
});

describe("window.open — https://html.spec.whatwg.org/#dom-open", () => {
  test("returns null (nothing is opened) and reports not implemented like jsdom", () => {
    const reports: string[] = [];
    win.addEventListener("error", () => reports.push("error"));
    expect(win.open("https://example.com/")).toBeNull();
  });
});

describe("customElements — https://html.spec.whatwg.org/#dom-window-customelements", () => {
  test("one CustomElementRegistry per window, the same object on every access", () => {
    const other: any = createWindow();
    try {
      expect([win.customElements === win.customElements, win.customElements === other.customElements, win.customElements.constructor.name]).toEqual([true, false, "CustomElementRegistry"]);
    } finally {
      other.close();
    }
  });
});
