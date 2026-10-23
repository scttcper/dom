// https://html.spec.whatwg.org/#the-navigator-object
// https://w3c.github.io/clipboard-apis/#async-clipboard-api (in-memory clipboard)

import { availableParallelism } from "node:os";
import { EventTarget } from "../events/EventTarget.ts";
import type { Window } from "./Window.ts";

type ClipboardItemData = string | Blob | PromiseLike<string | Blob>;

/** https://w3c.github.io/clipboard-apis/#clipboarditem */
export class ClipboardItem {
  _items: Map<string, ClipboardItemData>;
  _presentationStyle: string;

  constructor(items: Record<string, ClipboardItemData>, options: { presentationStyle?: string } = {}) {
    if (items === null || typeof items !== "object" || Object.keys(items).length === 0) {
      throw new TypeError("Failed to construct 'ClipboardItem': Empty dictionary argument");
    }
    this._items = new Map(Object.entries(items));
    this._presentationStyle = options.presentationStyle ?? "unspecified";
  }

  get types(): readonly string[] {
    return Object.freeze([...this._items.keys()]);
  }

  get presentationStyle(): string {
    return this._presentationStyle;
  }

  async getType(type: string): Promise<Blob> {
    if (!this._items.has(type)) {
      throw new DOMException(`Failed to execute 'getType' on 'ClipboardItem': The type was not found`, "NotFoundError");
    }
    const data = await this._items.get(type)!;
    return typeof data === "string" ? new Blob([data], { type }) : data;
  }

  static supports(type: string): boolean {
    return type === "text/plain" || type === "text/html" || type === "image/png" || type.startsWith("web ");
  }
}

/** https://w3c.github.io/clipboard-apis/#clipboard-interface — the system clipboard is a per-window array. */
export class Clipboard extends EventTarget {
  _data: ClipboardItem[];

  constructor() {
    super();
    this._data = [];
  }

  async read(): Promise<ClipboardItem[]> {
    return this._data.slice();
  }

  async readText(): Promise<string> {
    for (const item of this._data) {
      if (item._items.has("text/plain")) return (await item.getType("text/plain")).text();
    }
    return "";
  }

  async write(data: ClipboardItem[]): Promise<void> {
    this._data = Array.from(data);
  }

  async writeText(data: string): Promise<void> {
    this._data = [new ClipboardItem({ "text/plain": String(data) })];
  }
}

let hardwareConcurrency = 0;

export class Navigator {
  _window: Window;
  _clipboard: Clipboard | null;
  _userActivation: { hasBeenActive: boolean; isActive: boolean } | null;

  constructor(window: Window) {
    this._window = window;
    this._clipboard = null;
    this._userActivation = null;
  }

  // https://html.spec.whatwg.org/#navigatorid
  get appCodeName(): string {
    return "Mozilla";
  }
  get appName(): string {
    return "Netscape";
  }
  get appVersion(): string {
    return this.userAgent.replace(/^Mozilla\//, "");
  }
  get platform(): string {
    return this._window._options.platform;
  }
  get product(): string {
    return "Gecko";
  }
  get productSub(): string {
    return "20030107";
  }
  get userAgent(): string {
    return this._window._options.userAgent;
  }
  get vendor(): string {
    return "Apple Computer, Inc.";
  }
  get vendorSub(): string {
    return "";
  }
  get oscpu(): undefined {
    return undefined;
  }

  // https://html.spec.whatwg.org/#navigatorlanguage
  get language(): string {
    return this._window._options.languages[0] ?? "en-US";
  }
  get languages(): readonly string[] {
    return this._window._options.languages;
  }

  // https://html.spec.whatwg.org/#navigatoronline
  get onLine(): boolean {
    return true;
  }

  // https://html.spec.whatwg.org/#navigatorcookies
  get cookieEnabled(): boolean {
    return true;
  }

  // https://html.spec.whatwg.org/#navigatorconcurrenthardware
  get hardwareConcurrency(): number {
    return (hardwareConcurrency ||= availableParallelism());
  }

  // https://html.spec.whatwg.org/#navigatorplugins
  get pdfViewerEnabled(): boolean {
    return false;
  }
  get plugins(): readonly unknown[] {
    return [];
  }
  get mimeTypes(): readonly unknown[] {
    return [];
  }
  javaEnabled(): boolean {
    return false;
  }

  // https://w3c.github.io/pointerevents/#extensions-to-the-navigator-interface
  get maxTouchPoints(): number {
    return 0;
  }

  // https://w3c.github.io/webdriver/#interface
  get webdriver(): boolean {
    return false;
  }

  get doNotTrack(): null {
    return null;
  }

  get deviceMemory(): number {
    return 8;
  }

  /** https://w3c.github.io/clipboard-apis/#navigator-interface */
  get clipboard(): Clipboard {
    return (this._clipboard ??= new Clipboard());
  }

  /** https://html.spec.whatwg.org/#the-useractivation-interface */
  get userActivation(): { hasBeenActive: boolean; isActive: boolean } {
    return (this._userActivation ??= { hasBeenActive: false, isActive: false });
  }

  /** https://w3c.github.io/beacon/ — nothing is sent. */
  sendBeacon(_url: string, _data?: unknown): boolean {
    return true;
  }

  vibrate(_pattern: number | number[]): boolean {
    return true;
  }

  registerProtocolHandler(): void {}
  unregisterProtocolHandler(): void {}

  get [Symbol.toStringTag](): string {
    return "Navigator";
  }
}
