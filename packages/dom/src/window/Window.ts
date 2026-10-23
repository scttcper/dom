// https://html.spec.whatwg.org/#the-window-object
//
// The Window: document, interface objects (installed once on Window.prototype, see
// interfaces.ts), location/history/navigator/screen/storage (created lazily on first access),
// animation-frame and idle callbacks and other async work built on the *host's* timers (looked
// up at call time, so Vitest/Jest fake timers control them), matchMedia, getComputedStyle (css
// area via windowHooks), and assorted no-op browser chrome.
//
// Window creation must stay well under 1 ms: no per-window classes or closures, every
// subsystem lazy. See installGlobals (globals.ts) for how a window becomes the test global.

import { EventTarget } from "../events/EventTarget.ts";
import { Event } from "../events/Event.ts";
import { Document } from "../nodes/Document.ts";
import { DocumentType } from "../nodes/DocumentType.ts";
import type { Element } from "../nodes/Element.ts";
import { CSSStyleDeclaration } from "../css/CSSStyleDeclaration.ts";
import { parseDocument } from "../parser/index.ts";
import { setCurrentWindow, currentWindowOrNull } from "./current.ts";
import { ensureInterfaces, eventInterface, domExport, type InterfaceMap } from "./interfaces.ts";
import { CSS } from "./fallbacks.ts";
import { DOMStringList } from "./DOMStringList.ts";
import { windowHooks } from "./hooks.ts";
import { Location } from "./Location.ts";
import { History } from "./History.ts";
import { Navigator } from "./Navigator.ts";
import { Screen, VisualViewport } from "./Screen.ts";
import { type StorageShed, type Storage, createStorageShed, createLocalStorage, createSessionStorage } from "./Storage.ts";
import { MediaQueryList, reportMediaQueryChanges } from "./media.ts";
import { CookieJar } from "./cookies.ts";
import { installEventHandlers } from "../events/handlers.ts";
import { getCurrentEvent } from "../events/dispatch.ts";
import { reportException } from "../events/report.ts";
import "./document.ts";
import { setNestedWindowFactory } from "./browsing-context.ts";
import { windowOrigin } from "./origin.ts";
import { $childWindows, $closed, $cookieJar, $customElements, $devicePixelRatio, $frameCallbacks, $frameElement, $frameId, $frameTask, $globalObject, $history, $host, $idleCallbacks, $idleId, $impl, $innerHeight, $innerWidth, $localStorage, $location, $mediaQueryLists, $navigator, $options, $parentWindow, $runningFrame, $screen, $scrollX, $scrollY, $sessionStorage, $shed, $tasks, $url, $visualViewport, $y } from "../keys.ts";

export interface WindowOptions {
  /** Document URL. Default "http://localhost/". */
  url?: string;
  /** Initial document markup. Default: an empty html/head/body document. */
  html?: string;
  /** Viewport size (innerWidth/innerHeight). Default 1024×768. */
  width?: number;
  height?: number;
  /** Screen size. Defaults to the viewport size. */
  screenWidth?: number;
  screenHeight?: number;
  devicePixelRatio?: number;
  /** navigator.userAgent */
  userAgent?: string;
  /** navigator.platform */
  platform?: string;
  /** navigator.languages (first one is navigator.language). Default ["en-US", "en"]. */
  languages?: readonly string[];
  /** document.referrer */
  referrer?: string;
  /** Overrides for media features in the fallback matchMedia evaluator, e.g. { "prefers-color-scheme": "dark" }. */
  mediaFeatures?: Record<string, string | number>;
  /**
   * How getComputedStyle serializes colors: "specified" (default) keeps the author's text like
   * jsdom does; "rgb" resolves to rgb()/rgba() as browsers do (docs/deviations.md). Process-wide
   * (one current window): every createWindow applies its value.
   */
  cssComputedColors?: "specified" | "rgb";
  /**
   * Expose `window.visualViewport`. Off by default for jsdom parity: without layout its numbers
   * mislead positioning libraries (Floating UI), which fall back to the document element when it
   * is absent (docs/deviations.md).
   */
  visualViewport?: boolean;
  /** Share localStorage (and `storage` events) with another window, like two same-origin tabs. */
  shareStorageWith?: Window;
  /**
   * `validationMessage` text for built-in constraint failures: "jsdom" (default) returns
   * jsdom's generic "Constraints not satisfied"; "browser" returns Chromium-like per-constraint
   * messages (docs/deviations.md). Custom validity messages are never affected.
   */
  validationMessages?: "jsdom" | "browser";
}

/** @internal Resolved, per-window constant options. */
export interface ResolvedWindowOptions {
  userAgent: string;
  platform: string;
  languages: readonly string[];
  referrer: string;
  screenWidth: number;
  screenHeight: number;
  mediaFeatures: Record<string, string | number> | undefined;
  /** html/forms/validation.ts reads this. */
  validationMessages: "jsdom" | "browser";
}

const PLATFORMS: Record<string, string> = { darwin: "MacIntel", win32: "Win32", linux: "Linux x86_64" };
const DEFAULT_PLATFORM = PLATFORMS[process.platform] ?? "";
const UA_OS: Record<string, string> = {
  darwin: "Macintosh; Intel Mac OS X 10_15_7",
  win32: "Windows NT 10.0; Win64; x64",
  linux: "X11; Linux x86_64",
};
const DEFAULT_USER_AGENT = `Mozilla/5.0 (${UA_OS[process.platform] ?? process.platform}) AppleWebKit/537.36 (KHTML, like Gecko) rtd/0.0.0`;
const DEFAULT_LANGUAGES: readonly string[] = Object.freeze(["en-US", "en"]);

/** @internal A nested browsing context (an <iframe>'s), see window/browsing-context.ts. */
export interface NestedBrowsingContext {
  parent: Window;
  frameElement: Element;
  /** srcdoc markup, or null for the initial about:blank document. */
  srcdoc: string | null;
}

/** A host timer tracked so that closing the window cancels it. */
interface PendingTask {
  handle: unknown;
  clear: (handle: never) => void;
  /** The host setTimeout it was scheduled with (a fake clock's, possibly since uninstalled). */
  scheduledWith: unknown;
}

interface IdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

type FrameRequestCallback = (time: number) => void;

let prototypeReady = false;

export class Window extends EventTarget {
  document: Document;
  name: string;
  status: string;
  opener: Window | null;
  /** @internal */
  [$options]: ResolvedWindowOptions;
  /** @internal The document's URL (https://dom.spec.whatwg.org/#concept-document-url) as a parsed URL. */
  [$url]: URL;
  [$location]: Location | null;
  [$history]: History | null;
  [$navigator]: Navigator | null;
  [$screen]: Screen | null;
  [$visualViewport]: VisualViewport | null;
  /** Present only for windows created with `visualViewport: true` (an own accessor). */
  declare readonly visualViewport?: VisualViewport;
  [$localStorage]: Storage | null;
  [$sessionStorage]: Storage | null;
  [$shed]: StorageShed | null;
  [$customElements]: unknown;
  [$cookieJar]: CookieJar | null;
  /** MediaQueryLists with change listeners (https://drafts.csswg.org/cssom-view/#evaluate-media-queries-and-report-changes). */
  [$mediaQueryLists]: Set<MediaQueryList>;
  [$tasks]: Set<PendingTask> | null;
  /** https://html.spec.whatwg.org/#list-of-animation-frame-callbacks */
  [$frameCallbacks]: Map<number, FrameRequestCallback> | null;
  [$runningFrame]: Map<number, FrameRequestCallback> | null;
  [$frameTask]: PendingTask | null;
  [$frameId]: number;
  [$idleCallbacks]: Map<number, PendingTask> | null;
  [$idleId]: number;
  [$innerWidth]: number;
  [$innerHeight]: number;
  [$devicePixelRatio]: number;
  [$scrollX]: number;
  [$scrollY]: number;
  [$closed]: boolean;
  /**
   * @internal The global whose timers/performance the window uses: the Node global by default,
   * the global it is installed on otherwise (a Jest vm context), so fake timers installed on
   * that global control animation frames and window tasks.
   */
  [$host]: typeof globalThis;
  /** @internal Parent window of a nested browsing context (iframe), else null. */
  [$parentWindow]: Window | null;
  /** @internal The <iframe> hosting this window, else null. */
  [$frameElement]: Element | null;
  /** @internal The host global this window is installed on (installGlobals), else null: what WindowProxy references to it return. */
  [$globalObject]: Window | null;
  /** @internal Nested windows of connected iframes in this window's document (created lazily). */
  [$childWindows]: Set<Window> | null;

  constructor(options: WindowOptions = {}, nested?: NestedBrowsingContext) {
    super();
    if (!prototypeReady) preparePrototype();
    const url = new URL(options.url ?? "http://localhost/");
    const doc = Document._createHTML(this, url.href);
    this.document = doc;
    this.name = "";
    this.status = "";
    this.opener = null;
    const width = options.width ?? 1024;
    const height = options.height ?? 768;
    this[$options] = {
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      platform: options.platform ?? DEFAULT_PLATFORM,
      languages: options.languages ?? DEFAULT_LANGUAGES,
      referrer: options.referrer ?? "",
      screenWidth: options.screenWidth ?? width,
      screenHeight: options.screenHeight ?? height,
      mediaFeatures: options.mediaFeatures,
      validationMessages: options.validationMessages === "browser" ? "browser" : "jsdom",
    };
    this[$url] = url;
    this[$location] = null;
    this[$history] = null;
    this[$navigator] = null;
    this[$screen] = null;
    this[$visualViewport] = null;
    this[$localStorage] = null;
    this[$sessionStorage] = null;
    this[$shed] = options.shareStorageWith === undefined ? null : options.shareStorageWith._storageShed;
    this[$customElements] = null;
    this[$cookieJar] = null;
    this[$mediaQueryLists] = new Set();
    this[$tasks] = null;
    this[$frameCallbacks] = null;
    this[$runningFrame] = null;
    this[$frameTask] = null;
    this[$frameId] = 0;
    this[$idleCallbacks] = null;
    this[$idleId] = 0;
    this[$innerWidth] = width;
    this[$innerHeight] = height;
    this[$devicePixelRatio] = options.devicePixelRatio ?? 1;
    this[$scrollX] = 0;
    this[$scrollY] = 0;
    this[$closed] = false;
    this[$host] = globalThis;
    this[$parentWindow] = null;
    this[$frameElement] = null;
    this[$childWindows] = null;
    this[$globalObject] = null;
    if (this[$shed] !== null) this[$shed].windows.add(this);
    if (options.visualViewport === true) {
      Object.defineProperty(this, "visualViewport", { get: visualViewportGetter, enumerable: true, configurable: true });
    }
    if (nested !== undefined) {
      // A nested browsing context never becomes the current window, uses its parent's host
      // timers and starts with about:blank (no doctype) or its srcdoc document.
      this[$parentWindow] = nested.parent;
      this[$frameElement] = nested.frameElement;
      this[$host] = nested.parent[$host];
      (nested.parent[$childWindows] ??= new Set()).add(this);
      // Same storage shed as the parent (same user agent "tab"), joined eagerly so `storage`
      // events reach frames that never touched storage themselves.
      this[$shed] = nested.parent._storageShed;
      this[$shed].windows.add(this);
      if (nested.srcdoc !== null) {
        parseDocument(nested.srcdoc, doc);
      } else {
        const html = doc.createElement("html");
        html.appendChild(doc.createElement("head"));
        html.appendChild(doc.createElement("body"));
        doc.appendChild(html);
      }
      return;
    }
    windowHooks.setComputedColorMode?.(options.cssComputedColors ?? "specified");
    setCurrentWindow(this);
    if (options.html !== undefined) {
      parseDocument(options.html, doc);
    } else {
      doc.appendChild(new DocumentType(doc, "html", "", ""));
      const html = doc.createElement("html");
      html.appendChild(doc.createElement("head"));
      html.appendChild(doc.createElement("body"));
      doc.appendChild(html);
    }
  }

  // --- WindowProxy self references (https://html.spec.whatwg.org/#dom-window) ---------------

  get window(): Window {
    return this;
  }
  get self(): Window {
    return this;
  }
  get frames(): Window {
    return this;
  }
  /** https://html.spec.whatwg.org/#dom-parent — a top-level traversable is its own parent. */
  get parent(): Window {
    const p = this[$parentWindow];
    return p === null ? this : (p[$globalObject] ?? p);
  }
  get top(): Window {
    let w = this[$parentWindow];
    if (w === null) return this;
    while (w[$parentWindow] !== null) w = w[$parentWindow];
    return w[$globalObject] ?? w;
  }
  get length(): number {
    return 0;
  }
  get frameElement(): Element | null {
    return this[$frameElement];
  }
  get closed(): boolean {
    return this[$closed];
  }

  /** https://html.spec.whatwg.org/#dom-origin */
  get origin(): string {
    return windowOrigin(this);
  }

  /** https://html.spec.whatwg.org/#dom-issecurecontext (https://w3c.github.io/webappsec-secure-contexts/#is-origin-trustworthy) */
  get isSecureContext(): boolean {
    const { protocol, hostname } = this[$url];
    if (protocol === "https:" || protocol === "wss:" || protocol === "file:") return true;
    return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]";
  }

  get crossOriginIsolated(): boolean {
    return false;
  }

  /** https://dom.spec.whatwg.org/#dom-window-event */
  get event(): Event | undefined {
    return getCurrentEvent();
  }

  // --- lazily created subsystems ------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-location */
  get location(): Location {
    return (this[$location] ??= new Location(this));
  }
  set location(value: string) {
    this.location.href = value;
  }

  /** https://html.spec.whatwg.org/#dom-history */
  get history(): History {
    return (this[$history] ??= new History(this));
  }

  /** https://html.spec.whatwg.org/#dom-navigator */
  get navigator(): Navigator {
    return (this[$navigator] ??= new Navigator(this));
  }
  get clientInformation(): Navigator {
    return this.navigator;
  }

  /** https://drafts.csswg.org/cssom-view/#dom-window-screen */
  get screen(): Screen {
    return (this[$screen] ??= new Screen(this));
  }

  /** https://html.spec.whatwg.org/#dom-localstorage */
  get localStorage(): Storage {
    return (this[$localStorage] ??= createLocalStorage(this));
  }

  /** https://html.spec.whatwg.org/#dom-sessionstorage */
  get sessionStorage(): Storage {
    return (this[$sessionStorage] ??= createSessionStorage(this));
  }

  /** https://html.spec.whatwg.org/#dom-window-customelements (html-elements registers the factory). */
  get customElements(): unknown {
    if (this[$customElements] === null) {
      const factory = windowHooks.createCustomElementRegistry;
      // TODO(html-elements): register windowHooks.createCustomElementRegistry.
      if (factory !== null) this[$customElements] = factory(this);
      else return undefined;
    }
    return this[$customElements];
  }

  /** @internal */
  get _storageShed(): StorageShed {
    if (this[$shed] === null) {
      this[$shed] = createStorageShed();
      this[$shed].windows.add(this);
    }
    return this[$shed];
  }

  /** @internal */
  get _cookieStore(): CookieJar {
    return (this[$cookieJar] ??= new CookieJar());
  }

  // --- viewport (https://drafts.csswg.org/cssom-view/#extensions-to-the-window-interface) ----
  // These are [Replaceable]; assigning a new viewport size re-evaluates media queries so
  // MediaQueryList change listeners fire (tests resize by assigning innerWidth).

  get innerWidth(): number {
    return this[$innerWidth];
  }
  set innerWidth(value: number) {
    this[$innerWidth] = value;
    if (this[$mediaQueryLists].size !== 0) reportMediaQueryChanges(this);
  }
  get innerHeight(): number {
    return this[$innerHeight];
  }
  set innerHeight(value: number) {
    this[$innerHeight] = value;
    if (this[$mediaQueryLists].size !== 0) reportMediaQueryChanges(this);
  }
  get outerWidth(): number {
    return this[$innerWidth];
  }
  get outerHeight(): number {
    return this[$innerHeight];
  }
  get devicePixelRatio(): number {
    return this[$devicePixelRatio];
  }
  set devicePixelRatio(value: number) {
    this[$devicePixelRatio] = value;
    if (this[$mediaQueryLists].size !== 0) reportMediaQueryChanges(this);
  }
  get screenX(): number {
    return 0;
  }
  get screenY(): number {
    return 0;
  }
  get screenLeft(): number {
    return 0;
  }
  get screenTop(): number {
    return 0;
  }
  get scrollX(): number {
    return this[$scrollX];
  }
  set scrollX(value: number) {
    this[$scrollX] = value;
  }
  get scrollY(): number {
    return this[$scrollY];
  }
  set scrollY(value: number) {
    this[$scrollY] = value;
  }
  get pageXOffset(): number {
    return this[$scrollX];
  }
  set pageXOffset(value: number) {
    this[$scrollX] = value;
  }
  get pageYOffset(): number {
    return this[$scrollY];
  }
  set pageYOffset(value: number) {
    this[$scrollY] = value;
  }

  /** https://drafts.csswg.org/cssom-view/#dom-window-scroll — no layout: just records the position. */
  scroll(x?: number | { left?: number; top?: number; behavior?: string }, y?: number): void {
    if (typeof x === "object" && x !== null) {
      if (x.left !== undefined) this[$scrollX] = normalizeScroll(x.left);
      if (x.top !== undefined) this[$scrollY] = normalizeScroll(x.top);
    } else if (x !== undefined) {
      this[$scrollX] = normalizeScroll(x);
      this[$scrollY] = normalizeScroll(y ?? 0);
    }
  }

  scrollTo(x?: number | { left?: number; top?: number; behavior?: string }, y?: number): void {
    this.scroll(x, y);
  }

  /** https://drafts.csswg.org/cssom-view/#dom-window-scrollby */
  scrollBy(x?: number | { left?: number; top?: number; behavior?: string }, y?: number): void {
    if (typeof x === "object" && x !== null) {
      this.scroll({ left: this[$scrollX] + (Number(x.left) || 0), top: this[$scrollY] + (Number(x.top) || 0) });
    } else {
      this.scroll(this[$scrollX] + (Number(x) || 0), this[$scrollY] + (Number(y) || 0));
    }
  }

  /**
   * Test convenience (browsers ignore resizeTo for non-popup windows, see docs/deviations.md):
   * set the viewport size, report media query changes and fire `resize`.
   */
  resizeTo(width: number, height: number): void {
    this[$innerWidth] = Number(width);
    this[$innerHeight] = Number(height);
    if (this[$mediaQueryLists].size !== 0) reportMediaQueryChanges(this);
    this.dispatchEvent(new Event("resize"));
  }

  resizeBy(x: number, y: number): void {
    this.resizeTo(this[$innerWidth] + Number(x), this[$innerHeight] + Number(y));
  }

  moveTo(_x: number, _y: number): void {}
  moveBy(_x: number, _y: number): void {}

  // --- CSSOM -----------------------------------------------------------------------------------

  /** https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle */
  getComputedStyle(element: Element, pseudoElement?: string | null): CSSStyleDeclaration {
    if (element === null || typeof element !== "object" || !($impl in element) || element[$impl].type !== 1) {
      throw new TypeError("Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.");
    }
    const hook = windowHooks.getComputedStyle ?? domExport<(e: Element, p?: string | null) => unknown>("getComputedStyle") ?? null;
    if (hook !== null) return hook(element, pseudoElement, this) as CSSStyleDeclaration;
    // TODO(css): register windowHooks.getComputedStyle. Fallback: the inline declarations only.
    return new CSSStyleDeclaration(element);
  }

  /** https://drafts.csswg.org/cssom-view/#dom-window-matchmedia */
  matchMedia(query: string): MediaQueryList {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'matchMedia' on 'Window': 1 argument required, but only 0 present.");
    return new MediaQueryList(this, String(query).trim());
  }

  /** https://w3c.github.io/selection-api/#dom-window-getselection */
  getSelection(): unknown {
    const doc = this.document as unknown as { getSelection?: () => unknown };
    // TODO(dom-core): Document.prototype.getSelection.
    return typeof doc.getSelection === "function" ? doc.getSelection() : null;
  }

  // --- animation frames, idle callbacks, tasks -----------------------------------------------

  /** https://html.spec.whatwg.org/#dom-animationframeprovider-requestanimationframe */
  requestAnimationFrame(callback: FrameRequestCallback): number {
    if (typeof callback !== "function") {
      throw new TypeError("Failed to execute 'requestAnimationFrame' on 'Window': The callback provided as parameter 1 is not a function.");
    }
    const id = ++this[$frameId];
    (this[$frameCallbacks] ??= new Map()).set(id, callback);
    // One host timer per frame: every callback requested before the frame runs in it with
    // the same timestamp, like https://html.spec.whatwg.org/#run-the-animation-frame-callbacks.
    // Self-healing: a frame timer scheduled on a fake clock that has since been uninstalled
    // (jest.useRealTimers()) never fires; re-arm on the current host timer instead of letting
    // it wedge every later frame of this window.
    const pending = this[$frameTask];
    if (pending === null || pending.scheduledWith !== this._hostSetTimeout()) {
      if (pending !== null) this._cancelTask(pending);
      this[$frameTask] = this._task(runAnimationFrame, 16);
    }
    return id;
  }

  /** https://html.spec.whatwg.org/#animationframeprovider-cancelanimationframe */
  cancelAnimationFrame(handle: number): void {
    this[$frameCallbacks]?.delete(handle);
    this[$runningFrame]?.delete(handle);
  }

  /** https://w3c.github.io/requestidlecallback/#the-requestidlecallback-method */
  requestIdleCallback(callback: (deadline: IdleDeadline) => void, options?: { timeout?: number }): number {
    if (typeof callback !== "function") {
      throw new TypeError("Failed to execute 'requestIdleCallback' on 'Window': The callback provided as parameter 1 is not a function.");
    }
    void options;
    const id = ++this[$idleId];
    const map = (this[$idleCallbacks] ??= new Map());
    const task = this._task(() => {
      map.delete(id);
      const deadline = Date.now() + 50;
      callback({ didTimeout: false, timeRemaining: () => Math.max(0, deadline - Date.now()) });
    }, 1);
    if (task !== null) map.set(id, task);
    return id;
  }

  cancelIdleCallback(handle: number): void {
    const task = this[$idleCallbacks]?.get(handle);
    if (task === undefined) return;
    this[$idleCallbacks]!.delete(handle);
    this._cancelTask(task);
  }

  /**
   * @internal Queue `callback` on the host's setTimeout (the current global one, so fake
   * timers apply). Tracked so close() cancels it. Returns null once the window is closed.
   */
  _task(callback: () => void, delay: number): PendingTask | null {
    if (this[$closed]) return null;
    const tasks = (this[$tasks] ??= new Set());
    const host = typeof this[$host].setTimeout === "function" ? this[$host] : globalThis;
    const task: PendingTask = { handle: undefined, clear: host.clearTimeout as PendingTask["clear"], scheduledWith: host.setTimeout };
    task.handle = host.setTimeout(() => {
      tasks.delete(task);
      callback.call(this);
    }, delay);
    tasks.add(task);
    return task;
  }

  _hostSetTimeout(): unknown {
    const set = this[$host].setTimeout;
    return typeof set === "function" ? set : globalThis.setTimeout;
  }

  _cancelTask(task: PendingTask): void {
    this[$tasks]?.delete(task);
    task.clear(task.handle as never);
  }

  // --- messaging & errors --------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-window-postmessage */
  postMessage(message: unknown, targetOrigin?: string | { targetOrigin?: string; transfer?: unknown[] }, transfer?: unknown[]): void {
    let origin = typeof targetOrigin === "object" && targetOrigin !== null ? (targetOrigin.targetOrigin ?? "/") : (targetOrigin ?? "/");
    origin = String(origin);
    if (origin === "/") origin = this.origin;
    else if (origin !== "*") {
      const parsed = URL.parse(origin);
      if (parsed === null) throw new DOMException(`Failed to execute 'postMessage' on 'Window': Invalid target origin '${origin}' in a call to 'postMessage'.`, "SyntaxError");
      origin = parsed.origin;
    }
    if (origin !== "*" && origin !== this.origin) return;
    const transferList = Array.isArray(transfer) ? transfer : typeof targetOrigin === "object" && targetOrigin !== null ? targetOrigin.transfer : undefined;
    // Serialize synchronously (DataCloneError is thrown to the caller).
    const data = structuredClone(message, transferList === undefined ? undefined : { transfer: transferList as never[] });
    const source = this.origin;
    this._task(function (this: Window) {
      const MessageEvent = eventInterface("MessageEvent");
      this.dispatchEvent(new MessageEvent("message", { data, origin: source, source: this }) as never);
    }, 0);
  }

  /**
   * https://html.spec.whatwg.org/#dom-reporterror — fires a cancelable `error` ErrorEvent at the
   * window; when nobody handles it the events area's uncaught-exception handler runs (test
   * environments make that fail the test).
   */
  reportError(error: unknown): void {
    reportException(error, this);
  }

  // --- browser chrome no-ops (https://html.spec.whatwg.org/#user-prompts) ----------------------

  alert(_message?: unknown): void {}
  confirm(_message?: unknown): boolean {
    return false;
  }
  prompt(_message?: unknown, _default?: unknown): string | null {
    return null;
  }
  print(): void {}
  /** https://html.spec.whatwg.org/#dom-open — nothing is opened. */
  open(_url?: string, _target?: string, _features?: string): Window | null {
    return null;
  }
  stop(): void {}
  focus(): void {}
  blur(): void {}
  captureEvents(): void {}
  releaseEvents(): void {}

  /**
   * Close the window: cancels its pending animation frames, idle callbacks and tasks and marks
   * it closed (like jsdom's/happy-dom's `window.close()`; docs/deviations.md). Test
   * environments call this on teardown.
   */
  close(): void {
    if (this[$closed]) return;
    this[$closed] = true;
    const tasks = this[$tasks];
    if (tasks !== null) {
      for (const task of tasks) task.clear(task.handle as never);
      tasks.clear();
    }
    this[$frameCallbacks] = null;
    this[$runningFrame] = null;
    this[$frameTask] = null;
    this[$idleCallbacks] = null;
    this[$mediaQueryLists].clear();
    this[$shed]?.windows.delete(this);
    if (this[$childWindows] !== null) {
      for (const child of this[$childWindows]) child.close();
      this[$childWindows] = null;
    }
    this[$parentWindow]?.[$childWindows]?.delete(this);
    if (currentWindowOrNull() === this) setCurrentWindow(null);
  }

  // --- navigation internals --------------------------------------------------------------------

  /** @internal Location navigations (see History._navigate). */
  _navigate(url: URL, replace: boolean): void {
    this.history._navigate(url, replace);
  }

  /** @internal Set the document's URL. */
  _setURL(url: URL): void {
    this[$url] = url;
    this.document[$url] = url.href;
  }

  /** https://dom.spec.whatwg.org/#get-the-parent — a Window is the end of the propagation path. */
  override _getTheParent(_event: Event): EventTarget | null {
    return null;
  }

  get [Symbol.toStringTag](): string {
    return "Window";
  }
}

/** https://drafts.csswg.org/cssom-view/#dom-window-visualviewport (only with `visualViewport: true`) */
function visualViewportGetter(this: Window): VisualViewport {
  return (this[$visualViewport] ??= new VisualViewport(this));
}

/** https://html.spec.whatwg.org/#run-the-animation-frame-callbacks */
/**
 * Installed by src/html/focus.ts: the focus fixup step of "update the rendering"
 * (https://html.spec.whatwg.org/#update-the-rendering) runs on each animation frame.
 */
let renderingUpdateHook: ((doc: unknown) => void) | null = null;

export function setRenderingUpdateHook(fn: ((doc: unknown) => void) | null): void {
  renderingUpdateHook = fn;
}

function runAnimationFrame(this: Window): void {
  this[$frameTask] = null;
  if (renderingUpdateHook !== null) renderingUpdateHook(this.document);
  const callbacks = this[$frameCallbacks];
  if (callbacks === null) return;
  this[$frameCallbacks] = null;
  this[$runningFrame] = callbacks;
  const now = (this[$host].performance ?? performance).now();
  for (const [id, callback] of callbacks) {
    // Skip callbacks cancelled by an earlier callback in this frame.
    if (!callbacks.has(id)) continue;
    try {
      callback.call(this, now);
    } catch (error) {
      reportException(error, this);
    }
  }
  this[$runningFrame] = null;
}

function normalizeScroll(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

// Host (Node) globals every window exposes by delegation rather than by copy. Reads go to the
// current host global, so a faked `setTimeout` is what `window.setTimeout` returns.
export const HOST_DELEGATES = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "structuredClone",
  "atob",
  "btoa",
  "fetch",
  "crypto",
  "performance",
  "console",
  "URL",
  "URLSearchParams",
  "URLPattern",
  "AbortController",
  "AbortSignal",
  "Blob",
  "File",
  "TextEncoder",
  "TextDecoder",
  "TextEncoderStream",
  "TextDecoderStream",
  "ReadableStream",
  "ReadableStreamDefaultReader",
  "ReadableByteStreamController",
  "WritableStream",
  "WritableStreamDefaultWriter",
  "TransformStream",
  "ByteLengthQueuingStrategy",
  "CountQueuingStrategy",
  "CompressionStream",
  "DecompressionStream",
  "Headers",
  "Request",
  "Response",
  "FormData",
  "BroadcastChannel",
  "MessageChannel",
  "MessagePort",
  "WebSocket",
  "DOMException",
  "QuotaExceededError",
  "Crypto",
  "CryptoKey",
  "SubtleCrypto",
  "PerformanceEntry",
  "PerformanceMark",
  "PerformanceMeasure",
  "PerformanceObserver",
  "PerformanceObserverEntryList",
  "PerformanceResourceTiming",
  "WebAssembly",
  "Intl",
] as const;

// https://html.spec.whatwg.org/#globaleventhandlers + #windoweventhandlers
installEventHandlers(Window.prototype, "window");

// https://html.spec.whatwg.org/#barprop
const BAR_PROP = Object.freeze({ visible: true });
for (const name of ["locationbar", "menubar", "personalbar", "scrollbars", "statusbar", "toolbar"]) {
  Object.defineProperty(Window.prototype, name, { get: () => BAR_PROP, enumerable: true, configurable: true });
}

/** Once per process: interface objects and host delegates on Window.prototype. */
function preparePrototype(): void {
  prototypeReady = true;
  const proto = Window.prototype;
  ensureInterfaces(proto, { CSS, DOMStringList });
  const descriptors: PropertyDescriptorMap = {};
  for (const name of HOST_DELEGATES) {
    if (name in proto) continue;
    descriptors[name] = {
      get(this: Window) {
        return (this[$host] as unknown as Record<string, unknown>)[name] ?? (globalThis as Record<string, unknown>)[name];
      },
      set(this: Window, value: unknown) {
        Object.defineProperty(this, name, { value, writable: true, enumerable: true, configurable: true });
      },
      enumerable: false,
      configurable: true,
    };
  }
  Object.defineProperties(proto, descriptors);
}

/** The interface objects every window exposes (name → class). */
export function windowInterfaces(): InterfaceMap {
  if (!prototypeReady) preparePrototype();
  return ensureInterfaces(Window.prototype, { CSS, DOMStringList });
}

export function createWindow(options?: WindowOptions): Window {
  return new Window(options);
}

/**
 * @internal Create an iframe's nested browsing context (window/browsing-context.ts):
 * https://html.spec.whatwg.org/#create-a-new-child-navigable. Any `src` is treated as
 * about:blank content (never fetched) with the document URL set to it.
 */
function createNestedWindow(frameElement: Element, parent: Window, src: string | null, srcdoc: string | null): Window {
  let url = "about:blank";
  if (srcdoc !== null) url = "about:srcdoc";
  else if (src !== null && src !== "") url = URL.parse(src, parent.document.baseURI)?.href ?? "about:blank";
  // TODO(window): set the new document's [$aboutBase] (keys.ts) to parent.document.baseURI for
  // about:blank/about:srcdoc (https://html.spec.whatwg.org/#concept-document-about-base-url).
  return new Window(
    { url, width: parent[$innerWidth], height: parent[$innerHeight], devicePixelRatio: parent[$devicePixelRatio], userAgent: parent[$options].userAgent },
    { parent, frameElement, srcdoc },
  );
}
setNestedWindowFactory(createNestedWindow);
