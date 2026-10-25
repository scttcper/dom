/**
 * XMLHttpRequest: what @ctrl/dom's implementation adds on top of the jsdom differential suite
 * (tests/compat/test/xhr/): its transport, its window, and its deviations.
 *
 * Spec: XMLHttpRequest Standard
 *   - send():                https://xhr.spec.whatwg.org/#the-send()-method
 *   - synchronous flag:      https://xhr.spec.whatwg.org/#synchronous-flag
 *   - withCredentials:       https://xhr.spec.whatwg.org/#the-withcredentials-attribute
 * Fetch Standard
 *   - Referer / Origin:      https://fetch.spec.whatwg.org/#http-network-or-cache-fetch
 *   - blob: URLs:            https://fetch.spec.whatwg.org/#scheme-fetch
 * Referrer Policy, strict-origin-when-cross-origin:
 *   https://w3c.github.io/webappsec-referrer-policy/#referrer-policy-strict-origin-when-cross-origin
 * HTML Standard, the HTMLDocument legacy alias: https://html.spec.whatwg.org/#the-document-object
 *
 * Contract (src/window/xhr.ts): requests go through `http.request`/`https.request`, read off the
 * module objects at send time (nock and MSW patch them); closing the window aborts requests in
 * flight; synchronous requests throw NotSupportedError (docs/deviations.md).
 */
import http, { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createWindow, installGlobals, Document } from "@ctrl/dom";

type AnyRecord = Record<string, any>;

let server: Server;
let origin = "";
let lastHeaders: IncomingHttpHeaders = {};
let hangingClosed: Promise<void> = Promise.resolve();

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHeaders = req.headers;
    if (req.url === "/hang") {
      hangingClosed = new Promise((resolve) => req.socket.on("close", () => resolve()));
      return;
    }
    if (req.url === "/set-cookie") res.setHeader("Set-Cookie", "k=v; Path=/");
    res.setHeader("Content-Type", "text/plain");
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  origin = `http://localhost:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

function request(window: AnyRecord, url: string, setup?: (xhr: AnyRecord) => void): Promise<AnyRecord> {
  return new Promise((resolve) => {
    const xhr = new window.XMLHttpRequest();
    xhr.addEventListener("loadend", () => resolve(xhr));
    xhr.open("GET", url);
    setup?.(xhr);
    xhr.send();
  });
}

describe("transport — https://xhr.spec.whatwg.org/#the-send()-method", () => {
  test("send() creates its request with http.request read off the module at that moment (what nock and MSW patch)", async () => {
    const window = createWindow({ url: `${origin}/page` }) as AnyRecord;
    const original = http.request;
    const seen: string[] = [];
    http.request = ((...args: Parameters<typeof http.request>) => {
      seen.push(String(args[0]));
      return original(...args);
    }) as typeof http.request;
    try {
      const xhr = await request(window, "/data");
      expect([xhr.status, xhr.responseText]).toEqual([200, "ok"]);
      expect(seen).toEqual([`${origin}/data`]);
    } finally {
      http.request = original;
      window.close();
    }
  });

  test("closing the window aborts a request in flight, with no events after close()", async () => {
    const window = createWindow({ url: `${origin}/page` }) as AnyRecord;
    const xhr = new window.XMLHttpRequest();
    const events: string[] = [];
    for (const type of ["readystatechange", "abort", "error", "load", "loadend"]) xhr.addEventListener(type, () => events.push(type));
    xhr.open("GET", "/hang");
    xhr.send();
    await new Promise((resolve) => setTimeout(resolve, 30));
    events.length = 0;
    window.close();
    await hangingClosed;
    expect(events).toEqual([]);
  });
});

describe("synchronous flag — https://xhr.spec.whatwg.org/#synchronous-flag", () => {
  test("open(…, false) is accepted but send() throws NotSupportedError (docs/deviations.md)", () => {
    const window = createWindow({ url: `${origin}/page` }) as AnyRecord;
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", "/data", false);
    expect(() => xhr.send()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    expect(xhr.readyState).toBe(1);
    window.close();
  });
});

describe("request headers — https://fetch.spec.whatwg.org/#http-network-or-cache-fetch", () => {
  test("User-Agent comes from navigator.userAgent; Accept and Accept-Language default like jsdom", async () => {
    const window = createWindow({ url: `${origin}/page`, userAgent: "TestAgent/1.0" }) as AnyRecord;
    await request(window, "/data");
    expect([lastHeaders["user-agent"], lastHeaders.accept, lastHeaders["accept-language"], lastHeaders["accept-encoding"]]).toEqual(["TestAgent/1.0", "*/*", "en", "gzip, deflate"]);
    window.close();
  });

  test("same-origin: full Referer, no Origin; cross-origin: origin-only Referer plus Origin (strict-origin-when-cross-origin)", async () => {
    const same = createWindow({ url: `${origin}/page?q=1#frag` }) as AnyRecord;
    await request(same, "/data");
    expect([lastHeaders.referer, lastHeaders.origin]).toEqual([`${origin}/page?q=1`, undefined]);
    same.close();
    const other = createWindow({ url: "http://other.test/deep/page" }) as AnyRecord;
    await request(other, `${origin}/data`);
    expect([lastHeaders.referer, lastHeaders.origin]).toEqual(["http://other.test/", "http://other.test"]);
    other.close();
  });

  test("cookies are sent and stored same-origin, and cross-origin only with withCredentials — https://xhr.spec.whatwg.org/#the-withcredentials-attribute", async () => {
    const window = createWindow({ url: `${origin}/page` }) as AnyRecord;
    await request(window, "/set-cookie");
    expect(window.document.cookie).toBe("k=v");
    await request(window, "/data");
    expect(lastHeaders.cookie).toBe("k=v");
    window.close();
    const other = createWindow({ url: "http://other.test/" }) as AnyRecord;
    other.document.cookie = "x=1";
    await request(other, `${origin}/data`);
    expect(lastHeaders.cookie).toBeUndefined();
    other.close();
  });
});

describe("blob: URLs — https://fetch.spec.whatwg.org/#scheme-fetch", () => {
  test("a URL.createObjectURL() blob is read with its type and size", async () => {
    const window = createWindow({ url: `${origin}/page` }) as AnyRecord;
    const href = URL.createObjectURL(new Blob(["blob body"], { type: "text/plain" }));
    const xhr = await request(window, href);
    expect([xhr.status, xhr.responseText, xhr.getResponseHeader("content-type"), xhr.getResponseHeader("content-length")]).toEqual([200, "blob body", "text/plain", "9"]);
    URL.revokeObjectURL(href);
    window.close();
  });
});

describe("HTMLDocument — https://html.spec.whatwg.org/#the-document-object", () => {
  test("window.HTMLDocument is the Document interface object", () => {
    const window = createWindow();
    const target: AnyRecord = {};
    const uninstall = installGlobals(window, target);
    expect(target.HTMLDocument).toBe(Document);
    expect(window.document).toBeInstanceOf(target.HTMLDocument);
    expect(Object.getOwnPropertyDescriptor(target, "HTMLDocument")).toMatchObject({ writable: true, enumerable: false, configurable: true });
    uninstall();
    window.close();
  });
});
