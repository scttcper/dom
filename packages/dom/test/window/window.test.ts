/**
 * Window members that are not location/history/storage/timers/matchMedia, and the
 * window-dependent Document members.
 *
 * Spec:
 *   HTML Standard §7.2 "The Window object" — https://html.spec.whatwg.org/#the-window-object
 *   HTML Standard §8.9.1 "The Navigator object" — https://html.spec.whatwg.org/#the-navigator-object
 *   Clipboard API — https://w3c.github.io/clipboard-apis/#async-clipboard-api
 *   CSSOM View — https://drafts.csswg.org/cssom-view/#extensions-to-the-window-interface,
 *     https://drafts.csswg.org/cssom-view/#the-screen-interface
 *   HTML Standard §3.1.3 "Resource metadata management" — https://html.spec.whatwg.org/#dom-document-cookie,
 *     https://html.spec.whatwg.org/#dom-document-readystate, #dom-document-visibilitystate
 *   File API — https://w3c.github.io/FileAPI/#APIASynch, https://w3c.github.io/FileAPI/#filelist-section
 *   Resize Observer — https://drafts.csswg.org/resize-observer/#resize-observer-interface
 *   Intersection Observer — https://w3c.github.io/IntersectionObserver/#intersection-observer-interface
 *   Geometry Interfaces — https://drafts.fxtf.org/geometry/
 *   DOM Parsing — https://w3c.github.io/DOM-Parsing/#the-xmlserializer-interface
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWindow,
  installGlobals,
  Document,
  DOMParser,
  XMLSerializer,
  DOMMatrix,
  DOMPoint,
  DOMRect,
  DOMRectReadOnly,
  FileList,
  FileReader,
  IntersectionObserver,
  ResizeObserver,
  type Window,
} from "@rtd/dom";
import { createFileList } from "@rtd/dom/internal";

let window: Window;

beforeEach(() => {
  window = createWindow({ url: "http://localhost:3000/app/page" });
});

afterEach(() => {
  window.close();
  vi.useRealTimers();
});

describe("Window attributes — https://html.spec.whatwg.org/#the-window-object", () => {
  test("self references and frame tree on a top-level window", () => {
    expect(window.window).toBe(window);
    expect(window.self).toBe(window);
    expect(window.frames).toBe(window);
    expect(window.parent).toBe(window);
    expect(window.top).toBe(window);
    expect(window.length).toBe(0);
    expect(window.frameElement).toBeNull();
    expect(window.opener).toBeNull();
    expect(window.closed).toBe(false);
  });

  test("origin and isSecureContext (https://w3c.github.io/webappsec-secure-contexts/#is-origin-trustworthy)", () => {
    expect(window.origin).toBe("http://localhost:3000");
    expect(window.isSecureContext).toBe(true);
    expect(createWindow({ url: "http://example.com/" }).isSecureContext).toBe(false);
    expect(createWindow({ url: "https://example.com/" }).isSecureContext).toBe(true);
    expect(window.crossOriginIsolated).toBe(false);
  });

  test("viewport defaults to 1024x768 and is configurable", () => {
    expect([window.innerWidth, window.innerHeight, window.outerWidth, window.outerHeight]).toEqual([1024, 768, 1024, 768]);
    const w = createWindow({ width: 375, height: 812, devicePixelRatio: 3 });
    expect([w.innerWidth, w.innerHeight, w.devicePixelRatio]).toEqual([375, 812, 3]);
    expect(w.screen.width).toBe(375);
  });

  test("scroll/scrollTo/scrollBy record the scroll position (https://drafts.csswg.org/cssom-view/#dom-window-scroll)", () => {
    window.scrollTo(10, 20);
    expect([window.scrollX, window.scrollY, window.pageXOffset, window.pageYOffset]).toEqual([10, 20, 10, 20]);
    window.scrollBy({ top: 5 });
    expect(window.scrollY).toBe(25);
    window.scroll({ left: -5, behavior: "smooth" });
    expect(window.scrollX).toBe(0);
    window.scrollBy(1, 1);
    expect([window.scrollX, window.scrollY]).toEqual([1, 26]);
  });

  test("user prompts are inert (https://html.spec.whatwg.org/#user-prompts)", () => {
    expect(window.alert("x")).toBeUndefined();
    expect(window.confirm("x")).toBe(false);
    expect(window.prompt("x")).toBeNull();
    expect(window.open("/x")).toBeNull();
  });

  test("close() marks the window closed", () => {
    window.close();
    expect(window.closed).toBe(true);
  });

  test("screen and BarProp", () => {
    expect(window.screen.colorDepth).toBe(24);
    expect(window.screen.orientation.type).toBe("landscape-primary");
    expect((window as unknown as { toolbar: { visible: boolean } }).toolbar.visible).toBe(true);
  });

  test("visualViewport is absent by default (jsdom parity) and opt-in (https://drafts.csswg.org/cssom-view/#the-visualviewport-interface)", () => {
    expect("visualViewport" in window).toBe(false);
    expect(window.visualViewport).toBeUndefined();
    const w = createWindow({ visualViewport: true });
    expect(w.visualViewport!.width).toBe(1024);
    expect(w.visualViewport!.scale).toBe(1);
    expect(w.visualViewport).toBe(w.visualViewport);
    const target: Record<string, unknown> = {};
    const uninstall = installGlobals(w, target);
    expect(target.visualViewport).toBe(w.visualViewport);
    uninstall();
    const plain: Record<string, unknown> = {};
    installGlobals(createWindow(), plain)();
    expect("visualViewport" in plain).toBe(false);
  });

  test("cssComputedColors selects the computed color serialization (docs/deviations.md)", () => {
    const read = (w: Window) => {
      const el = w.document.body!.appendChild(w.document.createElement("p"));
      el.setAttribute("style", "color: red");
      return w.getComputedStyle(el).color;
    };
    expect(read(createWindow({ cssComputedColors: "rgb" }))).toBe("rgb(255, 0, 0)");
    expect(read(createWindow())).toBe("red");
  });

  test("getComputedStyle validates its argument", () => {
    expect(() => window.getComputedStyle({} as never)).toThrow(TypeError);
    const el = window.document.createElement("div");
    expect(window.getComputedStyle(el)).toBeTruthy();
  });

  test("Object.prototype.toString", () => {
    expect(Object.prototype.toString.call(window)).toBe("[object Window]");
    expect(Object.prototype.toString.call(window.location)).toBe("[object Location]");
    expect(Object.prototype.toString.call(window.navigator)).toBe("[object Navigator]");
  });
});

describe("Navigator — https://html.spec.whatwg.org/#the-navigator-object", () => {
  test("identity, language and capability attributes", () => {
    const n = window.navigator;
    expect(n.userAgent).toMatch(/^Mozilla\/5\.0 /);
    expect(n.appName).toBe("Netscape");
    expect(n.language).toBe("en-US");
    expect(n.languages).toEqual(["en-US", "en"]);
    expect(n.onLine).toBe(true);
    expect(n.cookieEnabled).toBe(true);
    expect(n.hardwareConcurrency).toBeGreaterThan(0);
    expect(n.maxTouchPoints).toBe(0);
    expect(n.webdriver).toBe(false);
    expect(window.navigator).toBe(n);
  });

  test("userAgent and languages are configurable", () => {
    const w = createWindow({ userAgent: "UA/1", languages: ["de-DE"] });
    expect(w.navigator.userAgent).toBe("UA/1");
    expect(w.navigator.language).toBe("de-DE");
  });

  test("clipboard is an in-memory async clipboard (https://w3c.github.io/clipboard-apis/#clipboard-interface)", async () => {
    const clipboard = window.navigator.clipboard;
    expect(await clipboard.readText()).toBe("");
    await clipboard.writeText("hello");
    expect(await clipboard.readText()).toBe("hello");
    const items = await clipboard.read();
    expect(items[0].types).toEqual(["text/plain"]);
    expect(await (await items[0].getType("text/plain")).text()).toBe("hello");
    const ClipboardItem = (window as unknown as { ClipboardItem: new (i: Record<string, string>) => never }).ClipboardItem;
    await clipboard.write([new ClipboardItem({ "text/html": "<b>x</b>" })]);
    expect(await clipboard.readText()).toBe("");
  });

  test("navigator.clipboard can be replaced with defineProperty (user-event's stub)", () => {
    const stub = { readText: async () => "stub" };
    Object.defineProperty(window.navigator, "clipboard", { get: () => stub, configurable: true });
    expect(window.navigator.clipboard).toBe(stub);
  });
});

describe("document.cookie — https://html.spec.whatwg.org/#dom-document-cookie", () => {
  test("sets and reads cookies; reassigning a name updates it", () => {
    const doc = window.document as unknown as { cookie: string };
    expect(doc.cookie).toBe("");
    doc.cookie = "a=1";
    doc.cookie = "b=2; SameSite=Lax";
    doc.cookie = "a=3";
    expect(doc.cookie).toBe("a=3; b=2");
  });

  test("max-age=0 and past expires delete; HttpOnly cookies are rejected", () => {
    const doc = window.document as unknown as { cookie: string };
    doc.cookie = "a=1";
    doc.cookie = "b=2";
    doc.cookie = "a=; max-age=0";
    doc.cookie = "b=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    doc.cookie = "c=3; HttpOnly";
    expect(doc.cookie).toBe("");
  });

  test("expired cookies disappear (fake Date)", () => {
    vi.useFakeTimers();
    const doc = window.document as unknown as { cookie: string };
    doc.cookie = "s=1; max-age=10";
    expect(doc.cookie).toBe("s=1");
    vi.advanceTimersByTime(11_000);
    expect(doc.cookie).toBe("");
  });

  test("path attribute limits visibility (https://httpwg.org/specs/rfc6265.html#cookie-path)", () => {
    const doc = window.document as unknown as { cookie: string };
    doc.cookie = "root=1; path=/";
    doc.cookie = "other=1; path=/other";
    doc.cookie = "app=1"; // default-path of /app/page is /app
    expect(doc.cookie).toBe("app=1; root=1");
  });

  test("documents without a browsing context are cookie-averse", () => {
    const doc = window.document.implementation.createHTMLDocument("") as unknown as { cookie: string };
    doc.cookie = "a=1";
    expect(doc.cookie).toBe("");
  });
});

describe("Document state — https://html.spec.whatwg.org/#the-document-object", () => {
  test("readyState, visibilityState, hidden, referrer", () => {
    const doc = window.document as unknown as Record<string, unknown>;
    expect(doc.readyState).toBe("complete");
    expect(doc.visibilityState).toBe("visible");
    expect(doc.hidden).toBe(false);
    expect(doc.referrer).toBe("");
    expect((createWindow({ referrer: "http://ref/" }).document as unknown as Record<string, unknown>).referrer).toBe("http://ref/");
  });
});

describe("FileReader — https://w3c.github.io/FileAPI/#APIASynch", () => {
  function read(kind: "readAsText" | "readAsDataURL" | "readAsArrayBuffer" | "readAsBinaryString", blob: Blob): Promise<{ reader: FileReader; events: string[] }> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const events: string[] = [];
      for (const type of ["loadstart", "progress", "load", "loadend"]) reader.addEventListener(type, () => events.push(type));
      reader.addEventListener("loadend", () => resolve({ reader, events }));
      reader[kind](blob);
      expect(reader.readyState).toBe(FileReader.LOADING);
    });
  }

  test("readAsText fires loadstart/progress/load/loadend and sets result", async () => {
    const { reader, events } = await read("readAsText", new Blob(["héllo"]));
    expect(events).toEqual(["loadstart", "progress", "load", "loadend"]);
    expect(reader.result).toBe("héllo");
    expect(reader.readyState).toBe(FileReader.DONE);
  });

  test("readAsDataURL uses the blob type", async () => {
    const { reader } = await read("readAsDataURL", new Blob(["hi"], { type: "text/plain" }));
    expect(reader.result).toBe("data:text/plain;base64,aGk=");
  });

  test("readAsArrayBuffer and readAsBinaryString", async () => {
    const buf = (await read("readAsArrayBuffer", new Blob([new Uint8Array([1, 2, 255])]))).reader.result as ArrayBuffer;
    expect([...new Uint8Array(buf)]).toEqual([1, 2, 255]);
    const bin = (await read("readAsBinaryString", new Blob([new Uint8Array([65, 255])]))).reader.result;
    expect(bin).toBe("Aÿ");
  });

  test("onload handler attribute and abort()", async () => {
    const reader = new FileReader();
    const onload = vi.fn();
    (reader as unknown as { onload: unknown }).onload = onload;
    const aborted = vi.fn();
    reader.addEventListener("abort", aborted);
    reader.readAsText(new Blob(["x"]));
    reader.abort();
    await new Promise((r) => setTimeout(r, 5));
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(onload).not.toHaveBeenCalled();
    expect(reader.result).toBeNull();
  });

  test("reading while busy throws InvalidStateError; non-Blob throws TypeError", () => {
    const reader = new FileReader();
    expect(() => reader.readAsText("nope" as never)).toThrow(TypeError);
    reader.readAsText(new Blob(["x"]));
    expect(() => reader.readAsText(new Blob(["y"]))).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });
});

describe("FileList — https://w3c.github.io/FileAPI/#filelist-section", () => {
  test("indexed access, item(), length, iteration; not constructible", () => {
    const a = new File(["a"], "a.txt");
    const b = new File(["b"], "b.txt");
    const list = createFileList([a, b]);
    expect(list).toBeInstanceOf(FileList);
    expect(list.length).toBe(2);
    expect(list[0]).toBe(a);
    expect(list.item(1)).toBe(b);
    expect(list.item(2)).toBeNull();
    expect([...list]).toEqual([a, b]);
    expect(() => new (FileList as unknown as new () => unknown)()).toThrow(TypeError);
  });
});

describe("observers — https://drafts.csswg.org/resize-observer/, https://w3c.github.io/IntersectionObserver/", () => {
  test("ResizeObserver is a well-behaved no-op", () => {
    const cb = vi.fn();
    const ro = new ResizeObserver(cb);
    const el = window.document.createElement("div");
    ro.observe(el);
    ro.unobserve(el);
    ro.disconnect();
    expect(cb).not.toHaveBeenCalled();
    expect(() => new ResizeObserver(undefined as never)).toThrow(TypeError);
  });

  test("IntersectionObserver normalizes options and validates thresholds", () => {
    const io = new IntersectionObserver(() => {}, { rootMargin: "10px 5%", threshold: [1, 0, 0.5] });
    expect(io.root).toBeNull();
    expect(io.rootMargin).toBe("10px 5% 10px 5%");
    expect(io.thresholds).toEqual([0, 0.5, 1]);
    expect(io.takeRecords()).toEqual([]);
    expect(() => new IntersectionObserver(() => {}, { threshold: 2 })).toThrow(RangeError);
  });
});

describe("geometry — https://drafts.fxtf.org/geometry/", () => {
  test("DOMRect derived edges and toJSON", () => {
    const r = new DOMRect(10, 20, -5, 30);
    expect([r.left, r.right, r.top, r.bottom]).toEqual([5, 10, 20, 50]);
    r.width = 5;
    expect(r.right).toBe(15);
    expect(DOMRectReadOnly.fromRect({ width: 2 }).toJSON()).toMatchObject({ x: 0, width: 2, right: 2 });
  });

  test("DOMMatrix 2D operations", () => {
    const m = new DOMMatrix().translate(10, 20).scale(2);
    expect(m.toString()).toBe("matrix(2, 0, 0, 2, 10, 20)");
    const p = m.transformPoint(new DOMPoint(1, 1));
    expect([p.x, p.y]).toEqual([12, 22]);
    expect(m.inverse().multiply(m).isIdentity).toBe(true);
    expect(new DOMMatrix("matrix(1, 0, 0, 1, 5, 6)").e).toBe(5);
  });
});

describe("DOMParser / XMLSerializer — https://html.spec.whatwg.org/#dom-parsing-and-serialization", () => {
  test("text/html returns an HTML document without a browsing context", () => {
    const doc = new DOMParser().parseFromString("<p id=x>hi</p>", "text/html");
    expect(doc.getElementById("x")?.textContent).toBe("hi");
    expect(doc.contentType).toBe("text/html");
    expect(doc.defaultView).toBeNull();
  });

  test("XML types create a non-HTML document with that content type (https://html.spec.whatwg.org/#dom-domparser-parsefromstring step 2.2)", () => {
    const doc = new DOMParser().parseFromString('<root xmlns="urn:x"><Item a="1"/></root>', "application/xml");
    expect(doc.contentType).toBe("application/xml");
    expect(doc.documentElement?.localName).toBe("root");
    expect(doc.documentElement?.namespaceURI).toBe("urn:x");
    expect(doc.documentElement?.firstElementChild?.localName).toBe("Item");
    const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"/>', "image/svg+xml");
    expect(svg.contentType).toBe("image/svg+xml");
  });

  test("unsupported types throw TypeError", () => {
    expect(() => new DOMParser().parseFromString("", "text/plain")).toThrow(TypeError);
  });

  test("XMLSerializer uses the XML serialization (https://w3c.github.io/DOM-Parsing/#dfn-xml-serialization)", () => {
    const el = window.document.createElement("br");
    expect(new XMLSerializer().serializeToString(el)).toBe('<br xmlns="http://www.w3.org/1999/xhtml" />');
  });

  test("Document.parseHTMLUnsafe parses a new document (https://html.spec.whatwg.org/#dom-parsehtmlunsafe)", () => {
    const parse = (Document as unknown as { parseHTMLUnsafe(html: string): Document }).parseHTMLUnsafe;
    const doc = parse("<title>t</title><p>x</p>");
    expect(doc.querySelector("title")?.textContent).toBe("t");
    expect(doc.body?.textContent).toBe("x");
  });

  test("DOMParser and XMLSerializer are window interfaces", () => {
    const w = window as unknown as Record<string, unknown>;
    expect(w.DOMParser).toBe(DOMParser);
    expect(w.XMLSerializer).toBe(XMLSerializer);
  });
});
