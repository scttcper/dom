/**
 * XMLHttpRequest against a local HTTP server — differential against jsdom 30 (whose XHR is the
 * one test suites and mocking tools were written against).
 *
 * Spec: XMLHttpRequest Standard
 *   - open():                    https://xhr.spec.whatwg.org/#the-open()-method
 *   - setRequestHeader():        https://xhr.spec.whatwg.org/#the-setrequestheader()-method
 *   - send() and its events:     https://xhr.spec.whatwg.org/#the-send()-method
 *   - abort():                   https://xhr.spec.whatwg.org/#the-abort()-method
 *   - timeout:                   https://xhr.spec.whatwg.org/#the-timeout-attribute
 *   - request error steps:       https://xhr.spec.whatwg.org/#request-error-steps
 *   - response headers:          https://xhr.spec.whatwg.org/#the-getallresponseheaders()-method
 *   - response bodies:           https://xhr.spec.whatwg.org/#response-body
 *   - overrideMimeType():        https://xhr.spec.whatwg.org/#the-overridemimetype()-method
 *   - body extraction:           https://fetch.spec.whatwg.org/#concept-bodyinit-extract
 *   - redirects:                 https://fetch.spec.whatwg.org/#http-redirect-fetch
 *
 * Both windows live at the server's origin, so requests are same-origin (jsdom enforces CORS,
 * which @ctrl/dom does not: docs/deviations.md). The server never sends Date, and the observations
 * leave out headers the two HTTP clients choose differently (User-Agent, Connection).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe } from "vitest";
import { differential, differentialAsync, type AnyWindow } from "../../src/harness.ts";

let server: Server;
let origin = "";
const url = () => `${origin}/page`;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.sendDate = false;
  const { pathname, searchParams } = new URL(req.url!, origin);
  switch (pathname) {
    case "/text":
      res.setHeader("Content-Type", "text/plain;charset=utf-8");
      return void res.end("hello");
    case "/json":
      res.setHeader("Content-Type", "application/json");
      return void res.end('{"a":1,"b":[true,null]}');
    case "/bad-json":
      res.setHeader("Content-Type", "application/json");
      return void res.end("{nope");
    case "/xml":
      res.setHeader("Content-Type", "text/xml");
      return void res.end('<?xml version="1.0"?><root><item n="1">one</item></root>');
    case "/html":
      res.setHeader("Content-Type", "text/html");
      return void res.end("<!doctype html><title>Page</title><p id=p>para</p>");
    case "/bytes":
      res.setHeader("Content-Type", "application/octet-stream");
      return void res.end(Buffer.from([1, 2, 3, 250]));
    case "/latin1":
      res.setHeader("Content-Type", "text/plain");
      return void res.end(Buffer.from("caf\xe9", "latin1"));
    case "/headers":
      res.setHeader("X-One", "1");
      res.setHeader("X-Multi", ["a", "b"]);
      res.setHeader("Set-Cookie", "c=1; Path=/");
      res.setHeader("Content-Type", "text/plain");
      return void res.end("h");
    case "/gzip":
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Encoding", "gzip");
      return void res.end(gzipSync("compressed body"));
    case "/empty":
      res.statusCode = 204;
      return void res.end();
    case "/status":
      res.statusCode = Number(searchParams.get("code"));
      res.setHeader("Content-Type", "text/plain");
      return void res.end("status body");
    case "/redirect": {
      res.statusCode = Number(searchParams.get("code") ?? 302);
      res.setHeader("Location", searchParams.get("to") ?? "/echo");
      return void res.end();
    }
    case "/chunks":
      res.setHeader("Content-Type", "text/plain");
      res.write("one");
      return void setTimeout(() => res.end("two"), 80);
    case "/slow":
      res.setHeader("Content-Type", "text/plain");
      res.write("a");
      return void setTimeout(() => res.writable && res.end("b"), 400);
    case "/hang":
      return void setTimeout(() => res.writable && res.end("late"), 1500);
    case "/echo": {
      const body = await readBody(req);
      const type = req.headers["content-type"] ?? null;
      const multipart = type?.startsWith("multipart/form-data") ?? false;
      res.setHeader("Content-Type", "application/json");
      return void res.end(
        JSON.stringify({
          method: req.method,
          type: multipart
            ? `multipart/form-data; boundary=${/boundary=/.test(type!) ? "(present)" : "(missing)"}`
            : type,
          body: multipart
            ? [...body.toString().matchAll(/name="([^"]*)"(?:; filename="([^"]*)")?/g)].map((m) =>
                m.slice(1).filter(Boolean).join(":"),
              )
            : body.toString("latin1"),
          length: multipart ? "(depends on the boundary)" : (req.headers["content-length"] ?? null),
          custom: req.headers["x-custom"] ?? null,
          accept: req.headers.accept ?? null,
          acceptLanguage: req.headers["accept-language"] ?? null,
          cookie: req.headers.cookie ?? null,
          referer: req.headers.referer?.replace(origin, "ORIGIN") ?? null,
        }),
      );
    }
  }
  res.statusCode = 404;
  res.end();
}

beforeAll(async () => {
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  origin = `http://localhost:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

interface RequestOptions {
  body?: unknown;
  setup?: (xhr: AnyWindow) => void;
  /** Record upload events too. */
  upload?: boolean;
  /** Called on the first progress event. */
  onProgress?: (xhr: AnyWindow) => void;
}

const VARYING_HEADERS = /^(connection|keep-alive|transfer-encoding|date):/;

/** Send one request and observe every event, then the response state. */
async function send(w: AnyWindow, method: string, path: string, options: RequestOptions = {}) {
  const xhr = new w.XMLHttpRequest();
  const log: string[] = [];
  const progress = (prefix: string) => (e: AnyWindow) =>
    log.push(`${prefix}${e.type}(${e.loaded},${e.total}${e.lengthComputable ? "" : ",?"})`);
  xhr.onreadystatechange = () => log.push(`rs${xhr.readyState}`);
  for (const type of ["loadstart", "progress", "load", "error", "abort", "timeout", "loadend"])
    xhr.addEventListener(type, progress(""));
  if (options.upload)
    for (const type of ["loadstart", "progress", "load", "error", "abort", "timeout", "loadend"])
      xhr.upload.addEventListener(type, progress("upload."));
  if (options.onProgress) xhr.addEventListener("progress", () => options.onProgress?.(xhr), { once: true });
  const done = new Promise((resolve) => xhr.addEventListener("loadend", resolve));
  xhr.open(method, origin + path);
  options.setup?.(xhr);
  xhr.send(options.body ?? null);
  await done;
  return {
    log,
    readyState: xhr.readyState,
    status: xhr.status,
    statusText: xhr.statusText,
    responseURL: xhr.responseURL.replace(origin, "ORIGIN"),
    // Sorted here: jsdom keeps arrival order (pinned separately below).
    headers: xhr
      .getAllResponseHeaders()
      .split("\r\n")
      .filter((line: string) => line !== "" && !VARYING_HEADERS.test(line))
      .sort(),
    xhr,
  };
}

const text = async (w: AnyWindow, path: string, options?: RequestOptions) => {
  const { xhr, ...rest } = await send(w, "GET", path, options);
  return { ...rest, responseText: xhr.responseText };
};
const echo = async (w: AnyWindow, method: string, body: unknown, setup?: (xhr: AnyWindow) => void) => {
  const { xhr } = await send(w, method, "/echo", { body, setup });
  return JSON.parse(xhr.responseText);
};

describe("send() — events and response state — https://xhr.spec.whatwg.org/#the-send()-method", () => {
  differentialAsync(
    "readystatechange and progress events of a small GET, then status, headers and text",
    (w) => text(w, "/text"),
    { url },
  );
  differentialAsync(
    "a body that arrives in two chunks fires readystatechange (LOADING) and progress per chunk",
    (w) => text(w, "/chunks"),
    { url },
  );
  differentialAsync("204 No Content goes from HEADERS_RECEIVED to DONE with no LOADING", (w) => text(w, "/empty"), {
    url,
  });
  differentialAsync(
    "HTTP error statuses are responses, not network errors",
    async (w) => [await text(w, "/status?code=404"), await text(w, "/status?code=500")],
    { url },
  );
  differentialAsync(
    "HEAD gets the headers and no body",
    async (w) => {
      const { xhr, ...rest } = await send(w, "HEAD", "/text");
      return { ...rest, responseText: xhr.responseText };
    },
    { url },
  );
  differentialAsync("gzip-encoded bodies are decoded; progress is not length-computable", (w) => text(w, "/gzip"), {
    url,
  });
  differentialAsync(
    "upload events bracket the request when the upload object has listeners and there is a body",
    async (w) => {
      const { log } = await send(w, "POST", "/echo", { body: "0123456789", upload: true });
      return log;
    },
    { url },
  );
  differentialAsync(
    "no upload events for a GET even with upload listeners",
    async (w) => (await send(w, "GET", "/text", { upload: true })).log,
    { url },
  );
});

describe("response bodies — https://xhr.spec.whatwg.org/#response-body", () => {
  differentialAsync(
    "responseType json parses; invalid JSON is null",
    async (w) => [
      (await send(w, "GET", "/json", { setup: (x) => (x.responseType = "json") })).xhr.response,
      (await send(w, "GET", "/bad-json", { setup: (x) => (x.responseType = "json") })).xhr.response,
    ],
    { url },
  );
  differentialAsync(
    "responseType arraybuffer",
    async (w) => {
      const { xhr } = await send(w, "GET", "/bytes", { setup: (x) => (x.responseType = "arraybuffer") });
      return [Object.prototype.toString.call(xhr.response), [...new Uint8Array(xhr.response)]];
    },
    { url },
  );
  differentialAsync(
    "responseType blob carries the final MIME type",
    async (w) => {
      const { xhr } = await send(w, "GET", "/text", { setup: (x) => (x.responseType = "blob") });
      return [xhr.response.size, xhr.response.type, await xhr.response.text()];
    },
    { url },
  );
  differentialAsync(
    "responseXML parses XML for responseType ''; HTML only for responseType 'document'",
    async (w) => {
      const xml = (await send(w, "GET", "/xml")).xhr;
      const html = (await send(w, "GET", "/html")).xhr;
      const doc = (await send(w, "GET", "/html", { setup: (x) => (x.responseType = "document") })).xhr;
      return {
        xml: [
          xml.responseXML.documentElement.localName,
          xml.responseXML.querySelector("item").getAttribute("n"),
          xml.responseXML.contentType,
        ],
        htmlWithoutDocumentType: html.responseXML,
        html: [
          doc.response.title,
          doc.response.getElementById("p").textContent,
          doc.response.contentType,
          doc.responseXML === doc.response,
        ],
      };
    },
    {
      url,
      jsdomFix: {
        fix: (o) => ({ ...o, xml: [o.xml[0], o.xml[1], "text/xml"] }),
        spec: "https://xhr.spec.whatwg.org/#document-response",
        reason:
          "The document's content type is the final MIME type (the server's text/xml); jsdom always reports application/xml.",
      },
    },
  );
  differentialAsync(
    "responseText decodes with the response charset; overrideMimeType changes it",
    async (w) => [
      (await send(w, "GET", "/latin1")).xhr.responseText,
      (await send(w, "GET", "/latin1", { setup: (x) => x.overrideMimeType("text/plain;charset=windows-1252") })).xhr
        .responseText,
    ],
    { url },
  );
  differentialAsync(
    "response and responseText for each responseType before and after DONE",
    async (w) => {
      const seen: unknown[] = [];
      for (const type of ["", "text", "json"]) {
        const { xhr } = await send(w, "GET", "/json", {
          setup: (x) => {
            x.responseType = type;
            x.addEventListener("readystatechange", () => seen.push([type, x.readyState, typeof x.response]));
          },
        });
        seen.push([type, "done", xhr.response === null ? "null" : typeof xhr.response]);
      }
      return seen;
    },
    { url },
  );
});

const byUppercasedName = (a: string, b: string) => {
  const x = a.split(":")[0].toUpperCase();
  const y = b.split(":")[0].toUpperCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/** https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine: one line per name, values joined by ", ". */
function combine(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const name = line.slice(0, line.indexOf(":"));
    const i = out.findIndex((l) => l.startsWith(`${name}:`));
    if (i === -1) out.push(line);
    else out[i] += `, ${line.slice(name.length + 2)}`;
  }
  return out;
}
const COMBINE = {
  spec: "https://xhr.spec.whatwg.org/#the-getallresponseheaders()-method",
  reason: "Step 2 combines repeated names into one line (sort and combine); jsdom prints one line per field.",
};

describe("response headers — https://xhr.spec.whatwg.org/#the-getallresponseheaders()-method", () => {
  differentialAsync(
    "getAllResponseHeaders lists names in legacy-uppercased byte order",
    async (w) =>
      (await send(w, "GET", "/headers")).xhr
        .getAllResponseHeaders()
        .split("\r\n")
        .filter((line: string) => line !== "" && !VARYING_HEADERS.test(line)),
    {
      url,
      jsdomFix: {
        fix: (lines: string[]) => combine(lines).sort(byUppercasedName),
        spec: "https://xhr.spec.whatwg.org/#the-getallresponseheaders()-method",
        reason:
          "Steps 2-3 combine repeated names and sort by legacy-uppercased name; jsdom prints one line per field in arrival order.",
      },
    },
  );
  differentialAsync(
    "getAllResponseHeaders sorts, lowercases and combines; Set-Cookie is never exposed",
    async (w) => {
      const { xhr, headers } = await send(w, "GET", "/headers");
      return {
        headers,
        multi: xhr.getResponseHeader("x-multi"),
        cookie: xhr.getResponseHeader("set-cookie"),
        caseless: xhr.getResponseHeader("X-ONE"),
        missing: xhr.getResponseHeader("x-none"),
      };
    },
    { url, jsdomFix: { fix: (o) => ({ ...o, headers: combine(o.headers) }), ...COMBINE } },
  );
  differentialAsync(
    "same-origin Set-Cookie lands in document.cookie and is sent back",
    async (w) => {
      await send(w, "GET", "/headers");
      return { cookie: w.document.cookie, sent: (await echo(w, "GET", null)).cookie };
    },
    { url },
  );
});

describe("request bodies — https://fetch.spec.whatwg.org/#concept-bodyinit-extract", () => {
  differentialAsync("string body: text/plain;charset=UTF-8", (w) => echo(w, "POST", "héllo"), { url });
  differentialAsync("URLSearchParams body", (w) => echo(w, "POST", new w.URLSearchParams({ a: "1", b: "x y" })), {
    url,
    jsdomFix: {
      fix: (o) => ({ ...o, type: "application/x-www-form-urlencoded;charset=UTF-8" }),
      spec: "https://fetch.spec.whatwg.org/#concept-bodyinit-extract",
      reason:
        "A URLSearchParams body is sent as application/x-www-form-urlencoded;charset=UTF-8; jsdom 30 sends its window's URLSearchParams as text/plain.",
    },
  });
  differentialAsync(
    "FormData body: multipart with a boundary, fields and files in order",
    (w) => {
      const form = new w.FormData();
      form.append("name", "Ada");
      form.append("file", new w.Blob(["contents"], { type: "text/plain" }), "notes.txt");
      return echo(w, "POST", form);
    },
    { url },
  );
  differentialAsync(
    "Blob body uses the blob's type",
    (w) => echo(w, "PUT", new w.Blob(["blob!"], { type: "application/x-thing" })),
    { url },
  );
  differentialAsync(
    "ArrayBuffer and typed array bodies have no Content-Type",
    async (w) => [
      await echo(w, "POST", new Uint8Array([104, 105]).buffer),
      await echo(w, "POST", new Uint8Array([0, 104, 105, 0]).subarray(1, 3)),
    ],
    { url },
  );
  differentialAsync(
    "an author Content-Type wins, with a string body's charset forced to UTF-8",
    async (w) => [
      await echo(w, "POST", "x", (x) => x.setRequestHeader("Content-Type", "application/json")),
      await echo(w, "POST", "x", (x) => x.setRequestHeader("Content-Type", "text/plain;charset=latin1")),
    ],
    { url },
  );
  differentialAsync("GET and HEAD ignore the body", (w) => echo(w, "GET", "ignored"), { url });
});

describe("setRequestHeader() — https://xhr.spec.whatwg.org/#the-setrequestheader()-method", () => {
  differentialAsync(
    "repeated names combine; forbidden names are silently dropped; defaults for Accept",
    async (w) =>
      echo(w, "GET", null, (x) => {
        x.setRequestHeader("X-Custom", "a");
        x.setRequestHeader("x-custom", "b");
        x.setRequestHeader("Cookie", "evil=1");
        x.setRequestHeader("Sec-Thing", "1");
        x.setRequestHeader("Proxy-Thing", "1");
      }),
    { url },
  );
});

describe("redirects — https://fetch.spec.whatwg.org/#http-redirect-fetch", () => {
  differentialAsync(
    "302 turns POST into GET without a body; responseURL is the final URL",
    async (w) => {
      const { xhr, log, responseURL } = await send(w, "POST", "/redirect?code=302&to=/echo", { body: "payload" });
      return { log, responseURL, echo: JSON.parse(xhr.responseText) };
    },
    { url },
  );
  differentialAsync(
    "307 keeps the method and body",
    async (w) => {
      const { xhr, responseURL } = await send(w, "POST", "/redirect?code=307&to=/echo", { body: "payload" });
      return { responseURL, echo: JSON.parse(xhr.responseText) };
    },
    { url },
  );
});

describe("abort() — https://xhr.spec.whatwg.org/#the-abort()-method", () => {
  differentialAsync(
    "abort() while LOADING runs the request error steps, then leaves the state UNSENT",
    (w) => text(w, "/slow", { onProgress: (x) => x.abort() }),
    {
      url,
      jsdomFix: {
        fix: (o) => ({ ...o, responseURL: "" }),
        spec: "https://xhr.spec.whatwg.org/#request-error-steps",
        reason:
          "The request error steps set the response to a network error, whose URL list is empty; jsdom keeps the URL.",
      },
    },
  );
  differentialAsync(
    "abort() right after send()",
    async (w) => {
      const xhr = new w.XMLHttpRequest();
      const log: string[] = [];
      xhr.onreadystatechange = () => log.push(`rs${xhr.readyState}`);
      for (const type of ["loadstart", "abort", "error", "load", "loadend"])
        xhr.addEventListener(type, () => log.push(type));
      xhr.open("GET", `${origin}/text`);
      xhr.send();
      xhr.abort();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { log, readyState: xhr.readyState, status: xhr.status };
    },
    { url },
  );
  differentialAsync(
    "abort() after DONE resets to UNSENT without events",
    async (w) => {
      const { xhr, log } = await send(w, "GET", "/text");
      xhr.abort();
      return { log, readyState: xhr.readyState, status: xhr.status, text: xhr.responseText };
    },
    { url },
  );
  differentialAsync(
    "open() during a request terminates it without events",
    async (w) => {
      const xhr = new w.XMLHttpRequest();
      const log: string[] = [];
      xhr.onreadystatechange = () => log.push(`rs${xhr.readyState}`);
      for (const type of ["loadstart", "abort", "error", "load", "loadend"])
        xhr.addEventListener(type, () => log.push(type));
      xhr.open("GET", `${origin}/slow`);
      xhr.send();
      xhr.open("GET", `${origin}/text`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { log, readyState: xhr.readyState };
    },
    { url },
  );
});

describe("timeout and network errors — https://xhr.spec.whatwg.org/#request-error-steps", () => {
  differentialAsync(
    "a timeout runs the request error steps with 'timeout'",
    (w) => text(w, "/hang", { setup: (x) => (x.timeout = 100) }),
    {
      url,
      jsdomFix: {
        // jsdom fires an extra progress event before readyState DONE, then resets to UNSENT.
        fix: (o) => ({ ...o, log: o.log.filter((e: string) => !e.startsWith("progress")), readyState: 4 }),
        spec: "https://xhr.spec.whatwg.org/#request-error-steps",
        reason:
          "The request error steps fire readystatechange, then the named event and loadend (no progress event), and leave the state DONE.",
      },
    },
  );
  differentialAsync(
    "a refused connection is a network error: error then loadend, status 0",
    async (w) => {
      const xhr = new w.XMLHttpRequest();
      const log: string[] = [];
      xhr.onreadystatechange = () => log.push(`rs${xhr.readyState}`);
      for (const type of ["loadstart", "progress", "error", "load", "loadend"])
        xhr.addEventListener(type, (e: AnyWindow) => log.push(`${type}(${e.loaded},${e.total})`));
      const done = new Promise((resolve) => xhr.addEventListener("loadend", resolve));
      xhr.open("GET", "http://127.0.0.1:1/");
      xhr.send();
      await done;
      return {
        log,
        status: xhr.status,
        readyState: xhr.readyState,
        text: xhr.responseText,
        headers: xhr.getAllResponseHeaders(),
      };
    },
    { url },
  );
});

describe("data: URLs — https://fetch.spec.whatwg.org/#data-url-processor", () => {
  differentialAsync(
    "base64 and percent-encoded data: URLs",
    async (w) => {
      const read = async (href: string) => {
        const xhr = new w.XMLHttpRequest();
        const done = new Promise((resolve) => xhr.addEventListener("loadend", resolve));
        xhr.open("GET", href);
        xhr.send();
        await done;
        return [xhr.status, xhr.responseText, xhr.getResponseHeader("content-type")];
      };
      return [
        await read("data:text/plain;base64,aGVsbG8="),
        await read("data:,a%20b"),
        await read("data:text/html;charset=utf-8,%3Cp%3E"),
      ];
    },
    { url },
  );
});

describe("open() and state errors — https://xhr.spec.whatwg.org/#the-open()-method", () => {
  differential("initial state", (w) => {
    const xhr = new w.XMLHttpRequest();
    return {
      constants: [
        w.XMLHttpRequest.UNSENT,
        w.XMLHttpRequest.OPENED,
        w.XMLHttpRequest.HEADERS_RECEIVED,
        w.XMLHttpRequest.LOADING,
        w.XMLHttpRequest.DONE,
        xhr.DONE,
      ],
      state: [
        xhr.readyState,
        xhr.status,
        xhr.statusText,
        xhr.responseURL,
        xhr.responseType,
        xhr.response,
        xhr.responseText,
        xhr.responseXML,
        xhr.timeout,
        xhr.withCredentials,
      ],
      headers: [xhr.getAllResponseHeaders(), xhr.getResponseHeader("x")],
      upload: [
        xhr.upload instanceof w.XMLHttpRequestUpload,
        xhr.upload instanceof w.XMLHttpRequestEventTarget,
        xhr.upload === xhr.upload,
      ],
    };
  });
  differential("open() fires readystatechange only when moving to OPENED", (w) => {
    const xhr = new w.XMLHttpRequest();
    const log: number[] = [];
    xhr.onreadystatechange = () => log.push(xhr.readyState);
    xhr.open("GET", "/a");
    xhr.open("POST", "/b");
    return log;
  });
  differential("errors thrown by open, send, setRequestHeader and the response accessors", (w) => {
    const name = (f: () => void) => {
      try {
        f();
        return "ok";
      } catch (e) {
        return (e as Error).name;
      }
    };
    const fresh = () => new w.XMLHttpRequest();
    const opened = () => {
      const x = fresh();
      x.open("GET", "/x");
      return x;
    };
    return {
      oneArgument: name(() => fresh().open("GET")),
      badMethod: name(() => fresh().open("GE T", "/x")),
      trace: name(() => fresh().open("trace", "/x")),
      connect: name(() => fresh().open("CONNECT", "/x")),
      badURL: name(() => fresh().open("GET", "http://[::1")),
      sendUnopened: name(() => fresh().send()),
      headerUnopened: name(() => fresh().setRequestHeader("a", "b")),
      badHeaderName: name(() => opened().setRequestHeader("a b", "c")),
      badHeaderValue: name(() => opened().setRequestHeader("a", "b\nc")),
      textWithJson: name(() => {
        const x = fresh();
        x.responseType = "json";
        return x.responseText;
      }),
      xmlWithText: name(() => {
        const x = fresh();
        x.responseType = "text";
        return x.responseXML;
      }),
      bogusResponseType: (() => {
        const x = fresh();
        x.responseType = "bogus";
        return x.responseType;
      })(),
      withCredentialsAfterSend: name(() => {
        const x = fresh();
        x.open("GET", "data:,x");
        x.send();
        try {
          x.withCredentials = true;
        } finally {
          x.abort();
        }
      }),
      sendTwice: name(() => {
        const x = fresh();
        x.open("GET", "data:,x");
        x.send();
        try {
          x.send();
        } finally {
          x.abort();
        }
      }),
      illegalUpload: name(() => new w.XMLHttpRequestUpload()),
      illegalEventTarget: name(() => new w.XMLHttpRequestEventTarget()),
    };
  });
});
