// https://html.spec.whatwg.org/#the-datatransfer-interface
// https://html.spec.whatwg.org/#the-datatransferitemlist-interface
// https://html.spec.whatwg.org/#the-datatransferitem-interface
//
// One drag data store per DataTransfer, always in read/write mode (no drag-and-drop
// operation drives protected/read-only modes here; user-event and tests construct their own
// DataTransfer objects). `getAsString` invokes its callback in a microtask instead of a task
// so it also completes under fake timers (docs/deviations.md).

import { createFileList, type FileList } from "../html/forms/FileList.ts";

const DROP_EFFECTS = new Set(["none", "copy", "link", "move"]);
const EFFECT_ALLOWED = new Set(["none", "copy", "copyLink", "copyMove", "link", "linkMove", "move", "all", "uninitialized"]);

function asciiLowercase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

let internal = false;

/** https://html.spec.whatwg.org/#the-datatransferitem-interface */
export class DataTransferItem {
  /** "string" | "file", or "" once removed from its list. */
  _kind: string;
  _type: string;
  _data: string;
  _file: File | null;

  constructor() {
    if (!internal) throw new TypeError("Illegal constructor");
    this._kind = "";
    this._type = "";
    this._data = "";
    this._file = null;
  }

  get kind(): string {
    return this._kind;
  }

  get type(): string {
    return this._type;
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitem-getasstring */
  getAsString(callback: ((data: string) => void) | null): void {
    if (callback === null || callback === undefined || this._kind !== "string") return;
    const data = this._data;
    queueMicrotask(() => callback(data));
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitem-getasfile */
  getAsFile(): File | null {
    return this._kind === "file" ? this._file : null;
  }

  webkitGetAsEntry(): null {
    return null;
  }
}
Object.defineProperty(DataTransferItem.prototype, Symbol.toStringTag, { value: "DataTransferItem", configurable: true });

function makeItem(kind: string, type: string, data: string, file: File | null): DataTransferItem {
  internal = true;
  try {
    const item = new DataTransferItem();
    item._kind = kind;
    item._type = type;
    item._data = data;
    item._file = file;
    return item;
  } finally {
    internal = false;
  }
}

/** https://html.spec.whatwg.org/#the-datatransferitemlist-interface */
export class DataTransferItemList {
  [index: number]: DataTransferItem;
  _items: DataTransferItem[];
  _owner: DataTransfer | null;

  constructor() {
    if (!internal) throw new TypeError("Illegal constructor");
    this._items = [];
    this._owner = null;
  }

  get length(): number {
    return this._items.length;
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitemlist-add */
  add(data: string | File, type?: string): DataTransferItem | null {
    let item: DataTransferItem;
    if (typeof data === "string" || type !== undefined) {
      if (arguments.length < 2) {
        throw new TypeError("Failed to execute 'add' on 'DataTransferItemList': parameter 1 is not of type 'File'.");
      }
      const t = asciiLowercase(String(type));
      for (const existing of this._items) {
        if (existing._kind === "string" && existing._type === t) {
          throw new DOMException(`Failed to execute 'add' on 'DataTransferItemList': An item already exists for type '${t}'.`, "NotSupportedError");
        }
      }
      item = makeItem("string", t, String(data), null);
    } else {
      if (typeof File === "undefined" || !(data instanceof File)) {
        throw new TypeError("Failed to execute 'add' on 'DataTransferItemList': parameter 1 is not of type 'File'.");
      }
      item = makeItem("file", asciiLowercase(data.type), "", data);
    }
    this._items.push(item);
    this._changed();
    return item;
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitemlist-remove */
  remove(index: number): void {
    const i = index >>> 0;
    if (i >= this._items.length) return;
    const [removed] = this._items.splice(i, 1);
    removed._kind = "";
    this._changed();
  }

  /** https://html.spec.whatwg.org/#dom-datatransferitemlist-clear */
  clear(): void {
    for (const item of this._items) item._kind = "";
    this._items.length = 0;
    this._changed();
  }

  [Symbol.iterator](): IterableIterator<DataTransferItem> {
    return this._items[Symbol.iterator]();
  }

  /** @internal Re-sync own index properties and invalidate the owner's cached views. */
  _changed(): void {
    const items = this._items;
    for (let i = 0; i < items.length; i++) {
      Object.defineProperty(this, i, { value: items[i], enumerable: true, configurable: true, writable: false });
    }
    for (let i = items.length; Object.prototype.hasOwnProperty.call(this, i); i++) delete (this as Record<number, unknown>)[i];
    if (this._owner !== null) {
      this._owner._types = null;
      this._owner._files = null;
    }
  }
}
Object.defineProperty(DataTransferItemList.prototype, Symbol.toStringTag, { value: "DataTransferItemList", configurable: true });

function makeList(owner: DataTransfer): DataTransferItemList {
  internal = true;
  try {
    const list = new DataTransferItemList();
    list._owner = owner;
    return list;
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
  _dropEffect: string;
  _effectAllowed: string;
  _items: DataTransferItemList;
  _types: readonly string[] | null;
  _files: FileList | null;

  /** https://html.spec.whatwg.org/#dom-datatransfer */
  constructor() {
    this._dropEffect = "none";
    this._effectAllowed = "uninitialized";
    this._items = makeList(this);
    this._types = null;
    this._files = null;
  }

  get dropEffect(): string {
    return this._dropEffect;
  }

  set dropEffect(value: string) {
    const v = String(value);
    if (DROP_EFFECTS.has(v)) this._dropEffect = v;
  }

  get effectAllowed(): string {
    return this._effectAllowed;
  }

  set effectAllowed(value: string) {
    const v = String(value);
    if (EFFECT_ALLOWED.has(v)) this._effectAllowed = v;
  }

  get items(): DataTransferItemList {
    return this._items;
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-setdragimage (no rendering: no-op). */
  setDragImage(_image: unknown, _x: number, _y: number): void {}

  /** https://html.spec.whatwg.org/#dom-datatransfer-types */
  get types(): readonly string[] {
    if (this._types !== null) return this._types;
    const out: string[] = [];
    let hasFiles = false;
    for (const item of this._items._items) {
      if (item._kind === "string") out.push(item._type);
      else if (item._kind === "file") hasFiles = true;
    }
    if (hasFiles) out.push("Files");
    return (this._types = Object.freeze(out));
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-getdata */
  getData(format: string): string {
    const { type, url } = normalizeFormat(format);
    for (const item of this._items._items) {
      if (item._kind !== "string" || item._type !== type) continue;
      if (!url) return item._data;
      // First URL in a text/uri-list: first line that is not a comment.
      for (const line of item._data.split(/\r?\n/)) {
        if (line !== "" && !line.startsWith("#")) return line;
      }
      return "";
    }
    return "";
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-setdata */
  setData(format: string, data: string): void {
    const { type } = normalizeFormat(format);
    const items = this._items._items;
    for (let i = 0; i < items.length; i++) {
      if (items[i]._kind === "string" && items[i]._type === type) {
        items[i]._kind = "";
        items.splice(i, 1);
        break;
      }
    }
    items.push(makeItem("string", type, String(data), null));
    this._items._changed();
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-cleardata */
  clearData(format?: string): void {
    const items = this._items._items;
    const type = format === undefined ? null : normalizeFormat(format).type;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i]._kind === "string" && (type === null || items[i]._type === type)) {
        items[i]._kind = "";
        items.splice(i, 1);
      }
    }
    this._items._changed();
  }

  /** https://html.spec.whatwg.org/#dom-datatransfer-files */
  get files(): FileList {
    if (this._files !== null) return this._files;
    const files: File[] = [];
    for (const item of this._items._items) if (item._kind === "file" && item._file !== null) files.push(item._file);
    return (this._files = createFileList(files));
  }
}
Object.defineProperty(DataTransfer.prototype, Symbol.toStringTag, { value: "DataTransfer", configurable: true });
