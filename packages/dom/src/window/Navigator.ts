// https://html.spec.whatwg.org/#the-navigator-object
// https://w3c.github.io/clipboard-apis/#async-clipboard-api (in-memory clipboard)

import { availableParallelism } from "node:os";
import { EventTarget } from "../events/EventTarget.ts";
import type { Window } from "./Window.ts";
import { $clipboard, $data, $items, $options, $presentationStyle, $userActivation, $window } from "../keys.ts";

type ClipboardItemData = string | Blob | PromiseLike<string | Blob>;

/** https://w3c.github.io/clipboard-apis/#clipboarditem */
export class ClipboardItem {
  [$items]: Map<string, ClipboardItemData>;
  [$presentationStyle]: string;

  constructor(items: Record<string, ClipboardItemData>, options: { presentationStyle?: string } = {}) {
    if (items === null || typeof items !== "object" || Object.keys(items).length === 0) {
      throw new TypeError("Failed to construct 'ClipboardItem': Empty dictionary argument");
    }
    this[$items] = new Map(Object.entries(items));
    this[$presentationStyle] = options.presentationStyle ?? "unspecified";
  }

  get types(): readonly string[] {
    return Object.freeze([...this[$items].keys()]);
  }

  get presentationStyle(): string {
    return this[$presentationStyle];
  }

  async getType(type: string): Promise<Blob> {
    if (!this[$items].has(type)) {
      throw new DOMException(`Failed to execute 'getType' on 'ClipboardItem': The type was not found`, "NotFoundError");
    }
    const data = await this[$items].get(type)!;
    return typeof data === "string" ? new Blob([data], { type }) : data;
  }

  static supports(type: string): boolean {
    return type === "text/plain" || type === "text/html" || type === "image/png" || type.startsWith("web ");
  }
}

/** https://w3c.github.io/clipboard-apis/#clipboard-interface — the system clipboard is a per-window array. */
export class Clipboard extends EventTarget {
  [$data]: ClipboardItem[];

  constructor() {
    super();
    this[$data] = [];
  }

  async read(): Promise<ClipboardItem[]> {
    return this[$data].slice();
  }

  async readText(): Promise<string> {
    for (const item of this[$data]) {
      if (item[$items].has("text/plain")) return (await item.getType("text/plain")).text();
    }
    return "";
  }

  async write(data: ClipboardItem[]): Promise<void> {
    this[$data] = Array.from(data);
  }

  async writeText(data: string): Promise<void> {
    this[$data] = [new ClipboardItem({ "text/plain": String(data) })];
  }
}

let hardwareConcurrency = 0;

export class Navigator {
  [$window]: Window;
  [$clipboard]: Clipboard | null;
  [$userActivation]: { hasBeenActive: boolean; isActive: boolean } | null;

  constructor(window: Window) {
    this[$window] = window;
    this[$clipboard] = null;
    this[$userActivation] = null;
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
    return this[$window][$options].platform;
  }
  get product(): string {
    return "Gecko";
  }
  get productSub(): string {
    return "20030107";
  }
  get userAgent(): string {
    return this[$window][$options].userAgent;
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
    return this[$window][$options].languages[0] ?? "en-US";
  }
  get languages(): readonly string[] {
    return this[$window][$options].languages;
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
    return (this[$clipboard] ??= new Clipboard());
  }
  /**
   * Deliberate deviation (docs/deviations.md): the spec attribute is readonly, so assignment
   * throws in strict mode, but jsdom has no `navigator.clipboard` and suites stub it with
   * `Object.assign(navigator, { clipboard })`. [Replaceable]-style
   * (https://webidl.spec.whatwg.org/#Replaceable): assigning shadows the accessor with an own
   * data property; deleting it brings the real clipboard back.
   */
  set clipboard(value: unknown) {
    Object.defineProperty(this, "clipboard", { value, writable: true, enumerable: true, configurable: true });
  }

  /** https://html.spec.whatwg.org/#the-useractivation-interface */
  get userActivation(): { hasBeenActive: boolean; isActive: boolean } {
    return (this[$userActivation] ??= { hasBeenActive: false, isActive: false });
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
