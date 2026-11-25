// https://html.spec.whatwg.org/#the-datatransfer-interface
// https://html.spec.whatwg.org/#the-datatransferitemlist-interface
// https://html.spec.whatwg.org/#the-datatransferitem-interface
//
// One drag data store per DataTransfer, always in read/write mode (no drag-and-drop
// operation drives protected/read-only modes here; user-event and tests construct their own
// DataTransfer objects). `getAsString` invokes its callback in a microtask instead of a task
// so it also completes under fake timers (docs/deviations.md).

import { createFileList, type FileList } from "../html/forms/FileList.ts";
import { defineHidden, exposeMembers } from "../webidl-runtime.ts";
import { setToStringTag } from "./Event.ts";
import { asciiLowercase } from "../nodes/attributes.ts";
import { $data, $dropEffect, $effectAllowed, $file, $files, $items, $kind, $owner, $type, $types } from "../keys.ts";

const DROP_EFFECTS = new Set(["none", "copy", "link", "move"]);
const EFFECT_ALLOWED = new Set([
  "none",
  "copy",
  "copyLink",
  "copyMove",
  "link",
  "linkMove",
  "move",
  "all",
  "uninitialized",
]);

let internal = false;

/** https://html.spec.whatwg.org/#the-datatransferitem-interface */
export class DataTransferItem {
  // Internal fields are created non-enumerable (defineHidden), so object walks skip them.
  /** "string" | "file", or "" once removed from its list. */
  declare [$kind]: string;
  declare [$type]: string;
  declare [$data]: string;
  declare [$file]: File | null;

  constructor() {
    if (!internal) throw new TypeError("Illegal constructor");
    defineHidden(this, $kind, "");
    defineHidden(this, $type, "");
    defineHidden(this, $data, "");
    defineHidden(this, $file, null);
  }

  get kind(): string {
    return this[$kind];
  }

  get type(): string {
    return this[$type];
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitem-getasstring */
  getAsString(callback: ((data: string) => void) | null): void {
    if (callback === null || callback === undefined || this[$kind] !== "string") return;
    const data = this[$data];
    queueMicrotask(() => callback(data));
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitem-getasfile */
  getAsFile(): File | null {
    return this[$kind] === "file" ? this[$file] : null;
  }

  webkitGetAsEntry(): null {
    return null;
  }
}
setToStringTag(DataTransferItem);

function makeItem(kind: string, type: string, data: string, file: File | null): DataTransferItem {
  internal = true;
  try {
    const item = new DataTransferItem();
    item[$kind] = kind;
    item[$type] = type;
    item[$data] = data;
    item[$file] = file;
    return item;
  } finally {
    internal = false;
  }
}

function disableItem(item: DataTransferItem): void {
  item[$kind] = "";
  item[$type] = "";
  item[$data] = "";
  item[$file] = null;
}

/** https://html.spec.whatwg.org/#the-datatransferitemlist-interface */
export class DataTransferItemList {
  [index: number]: DataTransferItem;
  declare [$items]: DataTransferItem[];
  /** Only needed to invalidate the transfer's cached files and types. */
  declare [$owner]: WeakRef<DataTransfer> | null;

  constructor() {
    if (!internal) throw new TypeError("Illegal constructor");
    defineHidden(this, $items, []);
    defineHidden(this, $owner, null);
  }

  get length(): number {
    return this[$items].length;
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitemlist-add */
  add(data: string | File, type?: string): DataTransferItem | null {
    let item: DataTransferItem;
    if (typeof data === "string" || type !== undefined) {
      if (arguments.length < 2) {
        throw new TypeError("Failed to execute 'add' on 'DataTransferItemList': parameter 1 is not of type 'File'.");
      }
      const t = asciiLowercase(String(type));
      for (const existing of this[$items]) {
        if (existing[$kind] === "string" && existing[$type] === t) {
          throw new DOMException(
            `Failed to execute 'add' on 'DataTransferItemList': An item already exists for type '${t}'.`,
            "NotSupportedError",
          );
        }
      }
      item = makeItem("string", t, String(data), null);
    } else {
      if (typeof File === "undefined" || !(data instanceof File)) {
        throw new TypeError("Failed to execute 'add' on 'DataTransferItemList': parameter 1 is not of type 'File'.");
      }
      item = makeItem("file", asciiLowercase(data.type), "", data);
    }
    const index = this[$items].length;
    this[$items].push(item);
    this._changed(index, index);
    return item;
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitemlist-remove */
  remove(index: number): void {
    const i = index >>> 0;
    if (i >= this[$items].length) return;
    const [removed] = this[$items].splice(i, 1);
    disableItem(removed);
    this._changed(i, this[$items].length + 1);
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitemlist-clear */
  clear(): void {
    const oldLength = this[$items].length;
    for (const item of this[$items]) disableItem(item);
    this[$items].length = 0;
    this._changed(0, oldLength);
  }

  [Symbol.iterator](): IterableIterator<DataTransferItem> {
    return this[$items][Symbol.iterator]();
  }

  /** @internal Re-sync own index properties and invalidate the owner's cached views. */
  _changed(first: number, oldLength: number): void {
    const items = this[$items];
    for (let i = first; i < items.length; i++) {
      Object.defineProperty(this, i, { value: items[i], enumerable: true, configurable: true, writable: false });
    }
    for (let i = items.length; i < oldLength; i++) delete this[i];
    const owner = this[$owner]?.deref();
    if (owner !== undefined) {
      owner[$types] = null;
      owner[$files] = null;
    }
  }
}
setToStringTag(DataTransferItemList);

function makeList(): DataTransferItemList {
  internal = true;
  try {
    return new DataTransferItemList();
  } finally {
    internal = false;
  }
}

function normalizeFormat(format: string): { type: string; url: boolean } {
  const f = asciiLowercase(String(format));
  if (f === "text") return { type: "text/plain", url: false };
  if (f === "url") return { type: "text/uri-list", url: true };
  return { type: f, url: false };
}

/** https://html.spec.whatwg.org/#the-datatransfer-interface */
export class DataTransfer {
  declare [$dropEffect]: string;
  declare [$effectAllowed]: string;
  declare [$items]: DataTransferItemList;
  declare [$types]: readonly string[] | null;
  declare [$files]: FileList | null;

  /** https://html.spec.whatwg.org/#dom-datatransfer */
  constructor() {
    defineHidden(this, $dropEffect, "none");
    defineHidden(this, $effectAllowed, "uninitialized");
    defineHidden(this, $items, makeList());
    defineHidden(this, $types, null);
    defineHidden(this, $files, null);
  }

  get dropEffect(): string {
    return this[$dropEffect];
  }

  set dropEffect(value: string) {
    const v = String(value);
    if (DROP_EFFECTS.has(v)) this[$dropEffect] = v;
  }

  get effectAllowed(): string {
    return this[$effectAllowed];
  }

  set effectAllowed(value: string) {
    const v = String(value);
    if (EFFECT_ALLOWED.has(v)) this[$effectAllowed] = v;
  }

  get items(): DataTransferItemList {
    return this[$items];
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-setdragimage (no rendering: no-op). */
  setDragImage(_image: unknown, _x: number, _y: number): void {}

  /** https://html.spec.whatwg.org/#dom-datatransfer-types */
  get types(): readonly string[] {
    if (this[$types] !== null) return this[$types];
    this[$items][$owner] ??= new WeakRef(this);
    const out: string[] = [];
    let hasFiles = false;
    for (const item of this[$items][$items]) {
      if (item[$kind] === "string") out.push(item[$type]);
      else if (item[$kind] === "file") hasFiles = true;
    }
    if (hasFiles) out.push("Files");
    return (this[$types] = Object.freeze(out));
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-getdata */
  getData(format: string): string {
    const { type, url } = normalizeFormat(format);
    for (const item of this[$items][$items]) {
      if (item[$kind] !== "string" || item[$type] !== type) continue;
      if (!url) return item[$data];
      // First URL in a text/uri-list: first line that is not a comment.
      for (const line of item[$data].split(/\r?\n/)) {
        if (line !== "" && !line.startsWith("#")) return line;
      }
      return "";
    }
    return "";
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-setdata */
  setData(format: string, data: string): void {
    const { type } = normalizeFormat(format);
    const item = makeItem("string", type, String(data), null);
    const items = this[$items][$items];
    const oldLength = items.length;
    let index = 0;
    for (; index < oldLength; index++) {
      if (items[index][$kind] === "string" && items[index][$type] === type) {
        disableItem(items[index]);
        items.splice(index, 1);
        break;
      }
    }
    items.push(item);
    this[$items]._changed(index, oldLength);
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-cleardata */
  clearData(format?: string): void {
    const items = this[$items][$items];
    const type = format === undefined ? null : normalizeFormat(format).type;
    const oldLength = items.length;
    let first = oldLength;
    let kept = 0;
    for (let i = 0; i < oldLength; i++) {
      const item = items[i];
      if (item[$kind] === "string" && (type === null || item[$type] === type)) {
        if (kept === i) first = i;
        disableItem(item);
      } else {
        if (kept !== i) items[kept] = item;
        kept++;
      }
    }
    items.length = kept;
    this[$items]._changed(first, oldLength);
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-files */
  get files(): FileList {
    if (this[$files] !== null) return this[$files];
    this[$items][$owner] ??= new WeakRef(this);
    const files: File[] = [];
    for (const item of this[$items][$items])
      if (item[$kind] === "file" && item[$file] !== null) files.push(item[$file]);
    return (this[$files] = createFileList(files));
  }
}
setToStringTag(DataTransfer);

exposeMembers(DataTransfer, DataTransferItemList, DataTransferItem);
