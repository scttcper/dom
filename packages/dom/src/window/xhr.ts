// XMLHttpRequest, XMLHttpRequestEventTarget, XMLHttpRequestUpload.
// https://xhr.spec.whatwg.org/
//
// Requests go out through Node's `http`/`https` modules, like jsdom's: mocking tools that work
// with jsdom keep working (MSW's Node XHR interceptor scopes `send()` and mocks the
// `http.ClientRequest` it creates; nock patches `http.request`), a test that mocks `fetch` does
// not hijack XHR, and nothing loads undici at startup. The modules are fetched with
// process.getBuiltinModule() on first use (no startup cost for files that never send), and
// `request` is read off the module object at send time so those patches apply. The network is
// reached exactly as jsdom reaches it (docs/deviations.md: no CORS checks, no synchronous requests).
//
// Each instance keeps its state in one record (`[$xhr]`, an XhrState), so instances share one
// shape and MSW's instance proxies (msw 2) see the same state as the instance itself. Every
// asynchronous step checks the record's generation: open() and abort() bump it, so callbacks of
// a superseded request drop out. A request registers with its window, and window.close() aborts it.

import type { ClientRequest } from "node:http";
import { Event } from "../events/Event.ts";
import { EventTarget } from "../events/EventTarget.ts";
import { fireAnEvent } from "../events/fire.ts";
import { getEventHandler, setEventHandler } from "../events/handlers.ts";
import { Document } from "../nodes/Document.ts";
import { parseDocument, parseXML, PARSERERROR_NS } from "../parser/index.ts";
import { serializeChildren, serializeXML } from "../serializer/index.ts";
import { currentWindowOrNull } from "./current.ts";
import { eventInterface } from "./interfaces.ts";
import type { Window } from "./Window.ts";
import { $closed, $contentType, $impl, $isHTML, $listeners, $url, $xhr } from "../keys.ts";

const UNSENT = 0;
const OPENED = 1;
const HEADERS_RECEIVED = 2;
const LOADING = 3;
const DONE = 4;

type Task = NonNullable<ReturnType<Window["_closeable"]>>;

/** An extracted request body: https://fetch.spec.whatwg.org/#concept-bodyinit-extract */
interface Body {
  /** Bytes, or a promise of them (Blob, FormData with files). */
  bytes: Uint8Array | Promise<Uint8Array>;
  type: string | null;
  /** Total bytes when known up front (upload progress). */
  length: number;
}

class XhrState {
  window: Window | null;
  state: number;
  send: boolean;
  sync: boolean;
  method: string;
  url: URL | null;
  /** Author request headers by lowercase name: [name as first set, combined value]. */
  headers: Map<string, [string, string]>;
  timeout: number;
  withCredentials: boolean;
  upload: XMLHttpRequestUpload;
  uploadComplete: boolean;
  uploadListener: boolean;
  /** Request body bytes (upload progress). */
  uploadTotal: number;
  responseType: string;
  overrideMime: string | null;
  /** The response is a network error (status 0, no headers, no body). */
  error: boolean;
  status: number;
  statusText: string;
  responseURL: string;
  /** Raw response header list: [lowercase name, value] per field line. */
  responseHeaders: Array<[string, string]>;
  chunks: Buffer[];
  received: number;
  bytesCache: Uint8Array | null;
  textCache: string | null;
  /** responseType-specific response object; `undefined` until computed (null is a valid result). */
  object: unknown;
  generation: number;
  request: ClientRequest | null;
  timer: Task | null;
  startedAt: number;
  closeTask: Task | null;

  constructor(window: Window | null, upload: XMLHttpRequestUpload) {
    this.window = window;
    this.state = UNSENT;
    this.send = false;
    this.sync = false;
    this.method = "GET";
    this.url = null;
    this.headers = new Map();
    this.timeout = 0;
    this.withCredentials = false;
    this.upload = upload;
    this.uploadComplete = false;
    this.uploadListener = false;
    this.uploadTotal = 0;
    this.responseType = "";
    this.overrideMime = null;
    this.error = true;
    this.status = 0;
    this.statusText = "";
    this.responseURL = "";
    this.responseHeaders = [];
    this.chunks = [];
    this.received = 0;
    this.bytesCache = null;
    this.textCache = null;
    this.object = undefined;
    this.generation = 0;
    this.request = null;
    this.timer = null;
    this.startedAt = 0;
    this.closeTask = null;
  }
}

// ── event targets ───────────────────────────────────────────────────────────────────────────────

/** https://xhr.spec.whatwg.org/#xmlhttprequesteventtarget */
export class XMLHttpRequestEventTarget extends EventTarget {
  constructor() {
    if (new.target === XMLHttpRequestEventTarget) throw new TypeError("Illegal constructor");
    super();
  }
}

const UPLOAD = Symbol("upload");

/** https://xhr.spec.whatwg.org/#xmlhttprequestupload */
export class XMLHttpRequestUpload extends XMLHttpRequestEventTarget {
  constructor(token?: unknown) {
    if (token !== UPLOAD) throw new TypeError("Illegal constructor");
    super();
  }
}

function defineHandlers(proto: object, types: readonly string[]): void {
  for (const type of types) {
    Object.defineProperty(proto, `on${type}`, {
      get(this: EventTarget) {
        return getEventHandler(this, type);
      },
      set(this: EventTarget, value: unknown) {
        setEventHandler(this, type, value);
      },
      enumerable: true,
      configurable: true,
    });
  }
}

// https://xhr.spec.whatwg.org/#handler-xhr-onloadstart and siblings
defineHandlers(XMLHttpRequestEventTarget.prototype, [
  "loadstart",
  "progress",
  "abort",
  "error",
  "load",
  "timeout",
  "loadend",
]);

function fireProgress(
  target: EventTarget,
  type: string,
  loaded: number,
  total: number,
  lengthComputable = total > 0,
): void {
  fireAnEvent(type, target, eventInterface("ProgressEvent") as never, { loaded, total, lengthComputable } as never);
}

function fireReadyStateChange(xhr: XMLHttpRequest): void {
  fireAnEvent("readystatechange", xhr, Event);
}

// ── XMLHttpRequest ──────────────────────────────────────────────────────────────────────────────

const state = (xhr: XMLHttpRequest): XhrState => {
  const s = xhr?.[$xhr];
  if (s === undefined) throw new TypeError("Illegal invocation");
  return s;
};

const invalidState = (operation: string, message: string) =>
  new DOMException(`Failed to ${operation} 'XMLHttpRequest': ${message}`, "InvalidStateError");

/** https://xhr.spec.whatwg.org/#interface-xmlhttprequest */
export class XMLHttpRequest extends XMLHttpRequestEventTarget {
  static readonly UNSENT = UNSENT;
  static readonly OPENED = OPENED;
  static readonly HEADERS_RECEIVED = HEADERS_RECEIVED;
  static readonly LOADING = LOADING;
  static readonly DONE = DONE;

  declare readonly UNSENT: 0;
  declare readonly OPENED: 1;
  declare readonly HEADERS_RECEIVED: 2;
  declare readonly LOADING: 3;
  declare readonly DONE: 4;

  [$xhr]: XhrState;

  /** https://xhr.spec.whatwg.org/#constructors — the relevant global is the current window. */
  constructor() {
    super();
    this[$xhr] = new XhrState(currentWindowOrNull(), new XMLHttpRequestUpload(UPLOAD));
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-readystate */
  get readyState(): number {
    return state(this).state;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-open */
  open(method: string, url: string, async?: boolean, username?: string | null, password?: string | null): void {
    const s = state(this);
    if (arguments.length < 2) {
      throw new TypeError(
        `Failed to execute 'open' on 'XMLHttpRequest': 2 arguments required, but only ${arguments.length} present.`,
      );
    }
    // Step 2: the document must be fully active.
    if (s.window !== null && s.window[$closed])
      throw invalidState("execute 'open' on", "The document is not fully active.");
    // Steps 3-5: method.
    method = String(method);
    if (!TOKEN.test(method))
      throw new DOMException(
        `Failed to execute 'open' on 'XMLHttpRequest': '${method}' is not a valid HTTP method.`,
        "SyntaxError",
      );
    const upper = method.toUpperCase();
    if (upper === "CONNECT" || upper === "TRACE" || upper === "TRACK") {
      throw new DOMException(
        `Failed to execute 'open' on 'XMLHttpRequest': '${method}' HTTP method is unsupported.`,
        "SecurityError",
      );
    }
    if (NORMALIZED_METHODS.has(upper)) method = upper;
    // Steps 6-8: URL, against the document's base URL.
    const parsed = URL.parse(String(url), s.window?.document.baseURI ?? undefined);
    if (parsed === null)
      throw new DOMException("Failed to execute 'open' on 'XMLHttpRequest': Invalid URL", "SyntaxError");
    // Steps 9-10.
    const asyncFlag = arguments.length < 3 ? true : !!async;
    if (parsed.host !== "") {
      if (username !== undefined && username !== null) parsed.username = String(username);
      if (password !== undefined && password !== null) parsed.password = String(password);
    }
    // Step 11: no synchronous requests with a timeout or responseType from a window.
    if (!asyncFlag && (s.timeout !== 0 || s.responseType !== "")) {
      throw new DOMException(
        "Failed to execute 'open' on 'XMLHttpRequest': Synchronous requests from a document must not set a timeout or responseType.",
        "InvalidAccessError",
      );
    }
    // Step 12: terminate the ongoing fetch.
    terminate(s);
    // Step 13.
    s.send = false;
    s.uploadListener = false;
    s.method = method;
    s.url = parsed;
    s.sync = !asyncFlag;
    s.headers.clear();
    setNetworkError(s);
    // Step 14.
    if (s.state !== OPENED) {
      s.state = OPENED;
      fireReadyStateChange(this);
    }
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-setrequestheader */
  setRequestHeader(name: string, value: string): void {
    const s = state(this);
    if (arguments.length < 2) {
      throw new TypeError(
        `Failed to execute 'setRequestHeader' on 'XMLHttpRequest': 2 arguments required, but only ${arguments.length} present.`,
      );
    }
    if (s.state !== OPENED || s.send)
      throw invalidState("execute 'setRequestHeader' on", "The object's state must be OPENED.");
    name = String(name);
    // Step 3: normalize (strip leading and trailing HTTP whitespace).
    value = String(value).replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
    if (!TOKEN.test(name))
      throw new DOMException(
        `Failed to execute 'setRequestHeader' on 'XMLHttpRequest': '${name}' is not a valid HTTP header field name.`,
        "SyntaxError",
      );
    if (/[\0\r\n]/.test(value))
      throw new DOMException(
        `Failed to execute 'setRequestHeader' on 'XMLHttpRequest': '${value}' is not a valid HTTP header field value.`,
        "SyntaxError",
      );
    // Step 5: forbidden request headers are ignored.
    const lower = name.toLowerCase();
    if (FORBIDDEN_REQUEST_HEADERS.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-")) return;
    // Step 6: combine.
    const existing = s.headers.get(lower);
    s.headers.set(lower, existing === undefined ? [name, value] : [existing[0], `${existing[1]}, ${value}`]);
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-timeout */
  get timeout(): number {
    return state(this).timeout;
  }
  set timeout(value: number) {
    const s = state(this);
    if (s.sync && s.state !== UNSENT) {
      throw new DOMException(
        "Failed to set the 'timeout' property on 'XMLHttpRequest': Timeouts cannot be set for synchronous requests made from a document.",
        "InvalidAccessError",
      );
    }
    s.timeout = Number(value) >>> 0;
    // Changed while a request is in flight: measured from when it started.
    if (s.send && s.request !== null) scheduleTimeout(this, s);
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-withcredentials */
  get withCredentials(): boolean {
    return state(this).withCredentials;
  }
  set withCredentials(value: boolean) {
    const s = state(this);
    if ((s.state !== UNSENT && s.state !== OPENED) || s.send) {
      throw invalidState(
        "set the 'withCredentials' property on",
        "The value may only be set if the object's state is UNSENT or OPENED.",
      );
    }
    s.withCredentials = !!value;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-upload */
  get upload(): XMLHttpRequestUpload {
    return state(this).upload;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-send */
  send(body?: unknown): void {
    const s = state(this);
    // Steps 1-2.
    if (s.state !== OPENED || s.send) throw invalidState("execute 'send' on", "The object's state must be OPENED.");
    if (s.window !== null && s.window[$closed])
      throw invalidState("execute 'send' on", "The document is not fully active.");
    if (s.sync) {
      throw new DOMException(
        "Failed to execute 'send' on 'XMLHttpRequest': Synchronous XMLHttpRequest is not supported by @ctrl/dom (docs/deviations.md).",
        "NotSupportedError",
      );
    }
    // Steps 3-4: body and Content-Type.
    let extracted: Body | null = null;
    if (body !== undefined && body !== null && s.method !== "GET" && s.method !== "HEAD") {
      extracted = extractBody(body);
      const author = s.headers.get("content-type");
      if (author !== undefined) {
        // A string or document body is always sent as UTF-8.
        if (typeof body === "string" || body instanceof Document) {
          author[1] = author[1].replace(/;\s*charset=("[^"]*"|[^;]*)/i, (m) =>
            /utf-8/i.test(m) ? m : ";charset=UTF-8",
          );
        }
      } else if (extracted.type !== null) {
        s.headers.set("content-type", ["Content-Type", extracted.type]);
      }
    }
    // Step 5: the upload listener flag.
    s.uploadListener = (s.upload[$listeners]?.size ?? 0) > 0;
    // Step 11: no body means nothing to upload.
    s.uploadTotal = extracted?.length ?? 0;
    s.uploadComplete = s.uploadTotal === 0;
    s.send = true;
    // Asynchronous steps 1-3.
    fireProgress(this, "loadstart", 0, 0);
    if (!s.uploadComplete && s.uploadListener) fireProgress(s.upload, "loadstart", 0, s.uploadTotal);
    if (s.state !== OPENED || !s.send) return;
    start(this, s, extracted);
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-abort */
  abort(): void {
    const s = state(this);
    terminate(s);
    if ((s.state === OPENED && s.send) || s.state === HEADERS_RECEIVED || s.state === LOADING)
      requestErrorSteps(this, s, "abort");
    // Step 3: no readystatechange for this transition.
    if (s.state === DONE) {
      s.state = UNSENT;
      setNetworkError(s);
    }
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-responseurl */
  get responseURL(): string {
    return state(this).responseURL;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-status */
  get status(): number {
    return state(this).status;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-statustext */
  get statusText(): string {
    return state(this).statusText;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-getresponseheader */
  getResponseHeader(name: string): string | null {
    const s = state(this);
    const lower = String(name).toLowerCase();
    if (lower === "set-cookie" || lower === "set-cookie2") return null;
    let value: string | null = null;
    for (const [n, v] of s.responseHeaders) {
      if (n === lower) value = value === null ? v : `${value}, ${v}`;
    }
    return value;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-getallresponseheaders */
  getAllResponseHeaders(): string {
    const s = state(this);
    const combined = new Map<string, string>();
    for (const [n, v] of s.responseHeaders) {
      if (n === "set-cookie" || n === "set-cookie2") continue;
      const prev = combined.get(n);
      combined.set(n, prev === undefined ? v : `${prev}, ${v}`);
    }
    // Step 3: names in ascending legacy-uppercased byte order.
    const names = [...combined.keys()].sort((a, b) => {
      const x = a.toUpperCase();
      const y = b.toUpperCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    let out = "";
    for (const n of names) out += `${n}: ${combined.get(n)}\r\n`;
    return out;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-overridemimetype */
  overrideMimeType(mime: string): void {
    const s = state(this);
    if (s.state === LOADING || s.state === DONE)
      throw invalidState(
        "execute 'overrideMimeType' on",
        "MimeType cannot be overridden when the state is LOADING or DONE.",
      );
    s.overrideMime = parseMime(String(mime)) === null ? "application/octet-stream" : String(mime);
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-responsetype */
  get responseType(): string {
    return state(this).responseType;
  }
  set responseType(value: string) {
    const s = state(this);
    value = String(value);
    // Not a member of the XMLHttpRequestResponseType enum: ignored (WebIDL).
    if (!RESPONSE_TYPES.has(value)) return;
    if (s.state === LOADING || s.state === DONE)
      throw invalidState(
        "set the 'responseType' property on",
        "The response type cannot be set if the object's state is LOADING or DONE.",
      );
    if (s.sync && s.state !== UNSENT) {
      throw new DOMException(
        "Failed to set the 'responseType' property on 'XMLHttpRequest': The response type cannot be changed for synchronous requests made from a document.",
        "InvalidAccessError",
      );
    }
    s.responseType = value;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-response */
  get response(): unknown {
    const s = state(this);
    const type = s.responseType;
    if (type === "" || type === "text") return s.state === LOADING || s.state === DONE ? text(s) : "";
    if (s.state !== DONE) return null;
    if (s.object !== undefined) return s.object;
    let object: unknown = null;
    if (!s.error) {
      if (type === "arraybuffer") object = new Uint8Array(bytes(s)).buffer;
      else if (type === "blob")
        object = new Blob([bytes(s) as Uint8Array<ArrayBuffer>], { type: finalMime(s)?.serialized ?? "" });
      else if (type === "document") object = documentResponse(s);
      else if (type === "json") object = jsonResponse(s);
    }
    s.object = object;
    return object;
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-responsetext */
  get responseText(): string {
    const s = state(this);
    if (s.responseType !== "" && s.responseType !== "text") {
      throw invalidState(
        "read the 'responseText' property from",
        `The value is only accessible if the object's 'responseType' is '' or 'text' (was '${s.responseType}').`,
      );
    }
    return s.state === LOADING || s.state === DONE ? text(s) : "";
  }

  /** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-responsexml */
  get responseXML(): Document | null {
    const s = state(this);
    if (s.responseType !== "" && s.responseType !== "document") {
      throw invalidState(
        "read the 'responseXML' property from",
        `The value is only accessible if the object's 'responseType' is '' or 'document' (was '${s.responseType}').`,
      );
    }
    if (s.state !== DONE || s.error) return null;
    if (s.object === undefined) s.object = documentResponse(s);
    return s.object as Document | null;
  }
}

// https://xhr.spec.whatwg.org/#handler-xhr-onreadystatechange
defineHandlers(XMLHttpRequest.prototype, ["readystatechange"]);
for (const [name, value] of [
  ["UNSENT", UNSENT],
  ["OPENED", OPENED],
  ["HEADERS_RECEIVED", HEADERS_RECEIVED],
  ["LOADING", LOADING],
  ["DONE", DONE],
] as const) {
  Object.defineProperty(XMLHttpRequest.prototype, name, { value, enumerable: true });
}

// ── fetching ────────────────────────────────────────────────────────────────────────────────────

/** https://httpwg.org/specs/rfc9110.html#tokens */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const NORMALIZED_METHODS = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT"]);
const RESPONSE_TYPES = new Set(["", "arraybuffer", "blob", "document", "json", "text"]);
/** https://fetch.spec.whatwg.org/#forbidden-request-header */
// oxfmt-ignore
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "accept-charset", "accept-encoding", "access-control-request-headers", "access-control-request-method", "connection",
  "content-length", "cookie", "cookie2", "date", "dnt", "expect", "host", "keep-alive", "origin", "referer", "set-cookie",
  "te", "trailer", "transfer-encoding", "upgrade", "via",
]);
/** https://fetch.spec.whatwg.org/#request-body-header-name */
const BODY_HEADERS = ["content-encoding", "content-language", "content-location", "content-type"];
const MAX_REDIRECTS = 20;

/** Stop the ongoing fetch: later callbacks of it see a stale generation. */
function terminate(s: XhrState): void {
  s.generation++;
  if (s.request !== null) {
    s.request.destroy();
    s.request = null;
  }
  if (s.timer !== null) {
    s.window?._cancelTask(s.timer);
    s.timer = null;
  }
  if (s.closeTask !== null) {
    s.window?._releaseCloseable(s.closeTask);
    s.closeTask = null;
  }
}

function setNetworkError(s: XhrState): void {
  s.error = true;
  s.status = 0;
  s.statusText = "";
  s.responseURL = "";
  s.responseHeaders = [];
  s.chunks = [];
  s.received = 0;
  s.bytesCache = null;
  s.textCache = null;
  s.object = undefined;
}

/** https://xhr.spec.whatwg.org/#request-error-steps */
function requestErrorSteps(xhr: XMLHttpRequest, s: XhrState, event: string): void {
  s.state = DONE;
  s.send = false;
  setNetworkError(s);
  fireReadyStateChange(xhr);
  if (!s.uploadComplete) {
    s.uploadComplete = true;
    if (s.uploadListener) {
      fireProgress(s.upload, event, 0, 0);
      fireProgress(s.upload, "loadend", 0, 0);
    }
  }
  fireProgress(xhr, event, 0, 0);
  fireProgress(xhr, "loadend", 0, 0);
}

function scheduleTimeout(xhr: XMLHttpRequest, s: XhrState): void {
  if (s.timer !== null) {
    s.window?._cancelTask(s.timer);
    s.timer = null;
  }
  if (s.timeout === 0 || s.window === null) return;
  const gen = s.generation;
  const remaining = Math.max(0, s.timeout - (Date.now() - s.startedAt));
  // https://xhr.spec.whatwg.org/#timed-out-flag — on the window's timers (virtual clock, fake timers).
  s.timer = s.window._task(() => {
    s.timer = null;
    if (s.generation !== gen) return;
    terminate(s);
    requestErrorSteps(xhr, s, "timeout");
  }, remaining);
}

function start(xhr: XMLHttpRequest, s: XhrState, body: Body | null): void {
  const gen = s.generation;
  s.startedAt = Date.now();
  s.closeTask = s.window?._closeable(() => terminate(s)) ?? null;
  scheduleTimeout(xhr, s);
  const go = (bytes: Uint8Array | null) => {
    if (s.generation !== gen) return;
    dispatchRequest(xhr, s, gen, s.url!, s.method, bytes, new Map(s.headers), 0);
  };
  if (body === null) go(null);
  else if (body.bytes instanceof Uint8Array) go(body.bytes);
  else body.bytes.then(go, () => s.generation === gen && networkError(xhr, s));
}

function networkError(xhr: XMLHttpRequest, s: XhrState): void {
  terminate(s);
  requestErrorSteps(xhr, s, "error");
}

function sameOrigin(a: URL, b: string): boolean {
  return a.origin !== "null" && a.origin === URL.parse(b)?.origin;
}

function dispatchRequest(
  xhr: XMLHttpRequest,
  s: XhrState,
  gen: number,
  url: URL,
  method: string,
  body: Uint8Array | null,
  headers: Map<string, [string, string]>,
  redirects: number,
): void {
  if (url.protocol === "data:")
    return void queueMicrotask(() => s.generation === gen && respondFromData(xhr, s, gen, url));
  if (url.protocol === "blob:") return void respondFromBlob(xhr, s, gen, url);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return void queueMicrotask(() => s.generation === gen && networkError(xhr, s));

  const window = s.window;
  const documentURL = window?.document.URL ?? "about:blank";
  const credentials = sameOrigin(url, documentURL) || s.withCredentials;
  const out: Record<string, string> = {};
  for (const [name, value] of headers.values()) out[name] = value;
  const has = (lower: string) => headers.has(lower);
  // jsdom's defaults (browser/resources/jsdom-dispatcher.js).
  if (!has("user-agent")) out["User-Agent"] = window?.navigator.userAgent ?? "";
  if (!has("accept")) out.Accept = "*/*";
  if (!has("accept-language")) out["Accept-Language"] = "en";
  out["Accept-Encoding"] = "gzip, deflate";
  const referrer = URL.parse(documentURL);
  if (referrer !== null && (referrer.protocol === "http:" || referrer.protocol === "https:")) {
    referrer.hash = "";
    referrer.username = "";
    referrer.password = "";
    // https://w3c.github.io/webappsec-referrer-policy/#referrer-policy-strict-origin-when-cross-origin
    out.Referer = referrer.origin === url.origin ? referrer.href : `${referrer.origin}/`;
    if (referrer.origin !== url.origin) out.Origin = referrer.origin;
  }
  if (credentials && window !== null) {
    const cookie = window._cookieStore.get(url);
    if (cookie !== "") out.Cookie = cookie;
  }
  const target = new URL(url);
  if (target.username !== "" || target.password !== "") {
    if (!has("authorization")) {
      out.Authorization = `Basic ${Buffer.from(`${decodeURIComponent(target.username)}:${decodeURIComponent(target.password)}`).toString("base64")}`;
    }
    target.username = "";
    target.password = "";
  }
  target.hash = "";
  if (body !== null) out["Content-Length"] = String(body.byteLength);

  const transport = process.getBuiltinModule(target.protocol === "https:" ? "node:https" : "node:http");
  let request: ClientRequest;
  try {
    request = transport.request(target, { method, headers: out });
  } catch {
    return void queueMicrotask(() => s.generation === gen && networkError(xhr, s));
  }
  s.request = request;
  request.on("error", () => {
    if (s.generation === gen) networkError(xhr, s);
  });
  request.on("response", (res) => {
    if (s.generation !== gen) {
      res.resume();
      return;
    }
    const status = res.statusCode ?? 0;
    const setCookie = res.headers["set-cookie"];
    if (credentials && window !== null && setCookie !== undefined)
      for (const c of setCookie) window._cookieStore.set(c, url);
    // https://fetch.spec.whatwg.org/#http-redirect-fetch
    const location = res.headers.location;
    if (
      (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) &&
      location !== undefined
    ) {
      res.resume();
      const next = URL.parse(location, url);
      if (next === null || redirects >= MAX_REDIRECTS) return networkError(xhr, s);
      let nextMethod = method;
      let nextBody = body;
      const nextHeaders = new Map(headers);
      if (
        ((status === 301 || status === 302) && method === "POST") ||
        (status === 303 && method !== "GET" && method !== "HEAD")
      ) {
        nextMethod = "GET";
        nextBody = null;
        for (const name of BODY_HEADERS) nextHeaders.delete(name);
      }
      if (next.origin !== url.origin) nextHeaders.delete("authorization");
      dispatchRequest(xhr, s, gen, next, nextMethod, nextBody, nextHeaders, redirects + 1);
      return;
    }
    const fields: Array<[string, string]> = [];
    for (let i = 0; i < res.rawHeaders.length; i += 2)
      fields.push([res.rawHeaders[i].toLowerCase(), res.rawHeaders[i + 1]]);
    const encoding = String(res.headers["content-encoding"] ?? "")
      .trim()
      .toLowerCase();
    const zlib = process.getBuiltinModule("node:zlib");
    const decoder =
      encoding === "gzip" || encoding === "x-gzip"
        ? zlib.createGunzip()
        : encoding === "deflate"
          ? zlib.createInflate()
          : encoding === "br"
            ? zlib.createBrotliDecompress()
            : null;
    const length = Number(res.headers["content-length"] ?? 0) || 0;
    processResponse(
      xhr,
      s,
      gen,
      url,
      status,
      res.statusMessage ?? "",
      fields,
      decoder === null ? res : res.pipe(decoder),
      decoder === null ? length : 0,
    );
  });
  if (body !== null) request.end(body);
  else request.end();
}

/** https://xhr.spec.whatwg.org/#dom-xmlhttprequest-send (process response, process body chunks, end-of-body) */
function processResponse(
  xhr: XMLHttpRequest,
  s: XhrState,
  gen: number,
  url: URL,
  status: number,
  statusText: string,
  fields: Array<[string, string]>,
  stream: NodeJS.ReadableStream | null,
  total: number,
): void {
  // https://xhr.spec.whatwg.org/#dom-xmlhttprequest-send (process request end-of-body): the body
  // has been transmitted once the response starts.
  if (!s.uploadComplete) {
    s.uploadComplete = true;
    if (s.uploadListener) {
      fireProgress(s.upload, "progress", s.uploadTotal, s.uploadTotal);
      fireProgress(s.upload, "load", s.uploadTotal, s.uploadTotal);
      fireProgress(s.upload, "loadend", s.uploadTotal, s.uploadTotal);
      if (s.generation !== gen) return;
    }
  }
  const responseURL = new URL(url);
  responseURL.hash = "";
  s.error = false;
  s.status = status;
  s.statusText = statusText;
  s.responseURL = responseURL.href;
  s.responseHeaders = fields;
  s.state = HEADERS_RECEIVED;
  fireReadyStateChange(xhr);
  if (s.generation !== gen) return;
  let reported = -1;
  const end = () => {
    if (s.generation !== gen) return;
    terminate(s);
    if (reported !== s.received) fireProgress(xhr, "progress", s.received, total, total > 0);
    s.send = false;
    s.state = DONE;
    fireReadyStateChange(xhr);
    fireProgress(xhr, "load", s.received, total, total > 0);
    fireProgress(xhr, "loadend", s.received, total, total > 0);
  };
  if (stream === null) return end();
  stream.on("data", (chunk: Buffer) => {
    if (s.generation !== gen) return;
    s.chunks.push(chunk);
    s.received += chunk.length;
    s.bytesCache = null;
    s.textCache = null;
    if (s.state === HEADERS_RECEIVED) s.state = LOADING;
    fireReadyStateChange(xhr);
    if (s.generation !== gen) return;
    reported = s.received;
    fireProgress(xhr, "progress", s.received, total, total > 0);
  });
  stream.on("end", end);
  stream.on("error", () => {
    if (s.generation === gen) networkError(xhr, s);
  });
}

/** https://fetch.spec.whatwg.org/#data-url-processor */
function respondFromData(xhr: XMLHttpRequest, s: XhrState, gen: number, url: URL): void {
  const href = url.href.slice("data:".length);
  const comma = href.indexOf(",");
  if (comma === -1) return networkError(xhr, s);
  let mime = href.slice(0, comma).trim();
  let data: Buffer;
  const raw = decodeURIComponentBytes(href.slice(comma + 1).replace(/#.*$/, ""));
  const base64 = /;\s*base64\s*$/i;
  if (base64.test(mime)) {
    mime = mime.replace(base64, "");
    const text = raw.toString("latin1").replace(/[\t\n\f\r ]/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.replace(/=+$/, "").length % 4 === 1) return networkError(xhr, s);
    data = Buffer.from(text, "base64");
  } else {
    data = raw;
  }
  if (mime.startsWith(";")) mime = `text/plain${mime}`;
  const type = parseMime(mime)?.serialized ?? "text/plain;charset=US-ASCII";
  processResponse(xhr, s, gen, url, 200, "OK", [["content-type", type]], bufferStream(data), data.length);
}

function respondFromBlob(xhr: XMLHttpRequest, s: XhrState, gen: number, url: URL): void {
  const blob = process.getBuiltinModule("node:buffer").resolveObjectURL(url.href);
  if (blob === undefined || s.method !== "GET")
    return void queueMicrotask(() => s.generation === gen && networkError(xhr, s));
  blob.arrayBuffer().then(
    (buffer) => {
      if (s.generation !== gen) return;
      const fields: Array<[string, string]> = [["content-length", String(blob.size)]];
      if (blob.type !== "") fields.push(["content-type", blob.type]);
      processResponse(xhr, s, gen, url, 200, "OK", fields, bufferStream(Buffer.from(buffer)), blob.size);
    },
    () => s.generation === gen && networkError(xhr, s),
  );
}

/** A one-chunk stream for data: and blob: responses, delivered asynchronously like a network body. */
function bufferStream(data: Buffer): NodeJS.ReadableStream | null {
  if (data.length === 0) return null;
  const listeners: Record<string, ((arg?: unknown) => void) | undefined> = {};
  const stream = {
    on(type: string, fn: (arg?: unknown) => void) {
      listeners[type] = fn;
      return stream;
    },
  };
  queueMicrotask(() => {
    listeners.data?.(data);
    listeners.end?.();
  });
  return stream as unknown as NodeJS.ReadableStream;
}

function decodeURIComponentBytes(s: string): Buffer {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x25 && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(Number.parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (c < 0x80) {
      out.push(c);
    } else {
      for (const b of Buffer.from(s[i])) out.push(b);
    }
  }
  return Buffer.from(out);
}

// ── bodies ──────────────────────────────────────────────────────────────────────────────────────

const tag = (value: unknown) => Object.prototype.toString.call(value);

/** https://fetch.spec.whatwg.org/#concept-bodyinit-extract (plus Document, https://xhr.spec.whatwg.org/#dom-xmlhttprequest-send step 4) */
function extractBody(body: unknown): Body {
  if (body instanceof Document) {
    const impl = body[$impl];
    const html = body[$isHTML];
    const bytes = Buffer.from(html ? serializeChildren(impl) : serializeXML(impl, false));
    return { bytes, type: html ? "text/html;charset=UTF-8" : "application/xml;charset=UTF-8", length: bytes.length };
  }
  if (body instanceof Blob) {
    return {
      bytes: body.arrayBuffer().then((b) => new Uint8Array(b)),
      type: body.type === "" ? null : body.type,
      length: body.size,
    };
  }
  if (ArrayBuffer.isView(body)) {
    const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice();
    return { bytes, type: null, length: bytes.length };
  }
  if (tag(body) === "[object ArrayBuffer]" || tag(body) === "[object SharedArrayBuffer]") {
    const bytes = new Uint8Array((body as ArrayBuffer).slice(0));
    return { bytes, type: null, length: bytes.length };
  }
  if (tag(body) === "[object FormData]") return multipart(body as FormData);
  if (tag(body) === "[object URLSearchParams]") {
    const bytes = Buffer.from(String(body));
    return { bytes, type: "application/x-www-form-urlencoded;charset=UTF-8", length: bytes.length };
  }
  const bytes = Buffer.from(String(body).toWellFormed());
  return { bytes, type: "text/plain;charset=UTF-8", length: bytes.length };
}

/** https://html.spec.whatwg.org/#multipart-form-data */
function multipart(form: FormData): Body {
  const boundary = `----ctrl-dom-${crypto.randomUUID().replaceAll("-", "")}`;
  const escape = (s: string) => s.replaceAll("\n", "%0A").replaceAll("\r", "%0D").replaceAll('"', "%22");
  const parts: Array<Uint8Array | Promise<Uint8Array>> = [];
  let length = 0;
  let pending = false;
  for (const [name, value] of form as unknown as Iterable<[string, string | Blob]>) {
    const n = escape(name.toWellFormed().replace(/\r(?!\n)|(?<!\r)\n/g, "\r\n"));
    if (typeof value === "string") {
      const v = value.toWellFormed().replace(/\r(?!\n)|(?<!\r)\n/g, "\r\n");
      const part = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`);
      parts.push(part);
      length += part.length;
    } else {
      const file = value as Blob & { name?: string };
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${n}"; filename="${escape(file.name ?? "blob")}"\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
      );
      parts.push(
        head,
        file.arrayBuffer().then((b) => new Uint8Array(b)),
        Buffer.from("\r\n"),
      );
      length += head.length + file.size + 2;
      pending = true;
    }
  }
  const tail = Buffer.from(`--${boundary}--\r\n`);
  parts.push(tail);
  length += tail.length;
  const type = `multipart/form-data; boundary=${boundary}`;
  if (!pending) return { bytes: Buffer.concat(parts as Uint8Array[]), type, length };
  return { bytes: Promise.all(parts).then((p) => Buffer.concat(p)), type, length };
}

// ── responses ───────────────────────────────────────────────────────────────────────────────────

interface Mime {
  essence: string;
  charset: string | null;
  serialized: string;
}

/** https://mimesniff.spec.whatwg.org/#parse-a-mime-type (essence and charset; enough for XHR) */
function parseMime(input: string): Mime | null {
  const semi = input.indexOf(";");
  const essence = (semi === -1 ? input : input.slice(0, semi)).trim().toLowerCase();
  const slash = essence.indexOf("/");
  if (
    slash <= 0 ||
    slash === essence.length - 1 ||
    !TOKEN.test(essence.slice(0, slash)) ||
    !TOKEN.test(essence.slice(slash + 1))
  )
    return null;
  let charset: string | null = null;
  if (semi !== -1) {
    const m = /(?:^|;)\s*charset\s*=\s*("([^"]*)"|[^;]*)/i.exec(input.slice(semi));
    if (m !== null) charset = (m[2] ?? m[1]).trim() || null;
  }
  return { essence, charset, serialized: input.trim() };
}

/** https://xhr.spec.whatwg.org/#final-mime-type */
function finalMime(s: XhrState): Mime | null {
  if (s.overrideMime !== null) return parseMime(s.overrideMime);
  let contentType: string | null = null;
  for (const [n, v] of s.responseHeaders) if (n === "content-type") contentType = v;
  return (contentType === null ? null : parseMime(contentType)) ?? parseMime("text/xml");
}

function bytes(s: XhrState): Uint8Array {
  return (s.bytesCache ??= s.chunks.length === 1 ? s.chunks[0] : Buffer.concat(s.chunks));
}

function decode(data: Uint8Array, label: string | null): string {
  // https://encoding.spec.whatwg.org/#decode: a BOM wins over the label.
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) label = "utf-8";
  else if (data[0] === 0xfe && data[1] === 0xff) label = "utf-16be";
  else if (data[0] === 0xff && data[1] === 0xfe) label = "utf-16le";
  try {
    return new TextDecoder(label ?? "utf-8").decode(data);
  } catch {
    return new TextDecoder("utf-8").decode(data);
  }
}

/** https://xhr.spec.whatwg.org/#text-response */
function text(s: XhrState): string {
  if (s.error) return "";
  if (s.textCache !== null) return s.textCache;
  const value = decode(bytes(s), finalMime(s)?.charset ?? null);
  if (s.state === DONE) s.textCache = value;
  return value;
}

/** https://xhr.spec.whatwg.org/#json-response — UTF-8, whatever the charset. */
function jsonResponse(s: XhrState): unknown {
  const data = bytes(s);
  if (data.length === 0) return null;
  try {
    return JSON.parse(decode(data, "utf-8"));
  } catch {
    return null;
  }
}

const isXMLMime = (essence: string) =>
  essence === "text/xml" || essence === "application/xml" || essence.endsWith("+xml");

/** https://xhr.spec.whatwg.org/#document-response */
function documentResponse(s: XhrState): Document | null {
  if (s.error) return null;
  const mime = finalMime(s);
  if (mime === null) return null;
  const html = mime.essence === "text/html";
  // Step 4: HTML is only parsed for responseType "document".
  if ((!html && !isXMLMime(mime.essence)) || (html && s.responseType === "")) return null;
  const source = decode(bytes(s), mime.charset);
  if (html) {
    const doc = Document._createHTML(null, s.responseURL);
    parseDocument(source, doc);
    return doc;
  }
  const doc = new Document();
  doc[$contentType] = mime.essence;
  doc[$url] = s.responseURL;
  parseXML(source, doc, mime.essence);
  // Step 6: not well-formed → null.
  const root = doc.documentElement;
  if (root !== null && root.localName === "parsererror" && root.namespaceURI === PARSERERROR_NS) return null;
  return doc;
}
