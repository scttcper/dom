// https://w3c.github.io/FileAPI/#APIASynch (FileReader)
//
// Built on Node's Blob/File. Reads complete asynchronously (promise jobs rather than tasks, so
// fake timers never stall them).

import { EventTarget } from "../events/EventTarget.ts";
import { getEventHandler, setEventHandler } from "../events/handlers.ts";
import { eventInterface } from "./interfaces.ts";

type ReadKind = "ArrayBuffer" | "BinaryString" | "Text" | "DataURL";

export class FileReader extends EventTarget {
  static readonly EMPTY = 0;
  static readonly LOADING = 1;
  static readonly DONE = 2;

  _readyState: number;
  _result: string | ArrayBuffer | null;
  _error: DOMException | null;
  /** Incremented by abort() and every new read so stale completions are dropped. */
  _generation: number;

  constructor() {
    super();
    this._readyState = 0;
    this._result = null;
    this._error = null;
    this._generation = 0;
  }

  get readyState(): number {
    return this._readyState;
  }
  get result(): string | ArrayBuffer | null {
    return this._result;
  }
  get error(): DOMException | null {
    return this._error;
  }

  readAsArrayBuffer(blob: Blob): void {
    this._read(blob, "ArrayBuffer");
  }
  readAsBinaryString(blob: Blob): void {
    this._read(blob, "BinaryString");
  }
  readAsText(blob: Blob, encoding?: string): void {
    this._read(blob, "Text", encoding);
  }
  readAsDataURL(blob: Blob): void {
    this._read(blob, "DataURL");
  }

  /** https://w3c.github.io/FileAPI/#dfn-abort */
  abort(): void {
    if (this._readyState === 0 || this._readyState === 2) {
      this._result = null;
      return;
    }
    this._generation++;
    this._readyState = 2;
    this._result = null;
    this._fire("abort");
    if (this._readyState !== 1) this._fire("loadend");
  }

  /** https://w3c.github.io/FileAPI/#readOperation */
  _read(blob: Blob, kind: ReadKind, encoding?: string): void {
    if (!(blob instanceof Blob)) {
      throw new TypeError(`Failed to execute 'readAs${kind}' on 'FileReader': parameter 1 is not of type 'Blob'.`);
    }
    // Step 1: InvalidStateError while a read is in progress.
    if (this._readyState === 1) {
      throw new DOMException("Failed to execute 'readAs" + kind + "' on 'FileReader': The object is already busy reading Blobs.", "InvalidStateError");
    }
    this._readyState = 1;
    this._result = null;
    this._error = null;
    const generation = ++this._generation;
    queueMicrotask(() => {
      if (generation === this._generation) this._fire("loadstart");
    });
    blob.arrayBuffer().then(
      (buffer) => {
        if (generation !== this._generation) return;
        const total = buffer.byteLength;
        this._fire("progress", total, total);
        if (generation !== this._generation) return;
        this._readyState = 2;
        this._result = packageData(buffer, kind, blob.type, encoding);
        this._fire("load", total, total);
        if (this._readyState !== 1) this._fire("loadend", total, total);
      },
      (error: unknown) => {
        if (generation !== this._generation) return;
        this._readyState = 2;
        this._error = error instanceof DOMException ? error : new DOMException(String(error), "NotReadableError");
        this._fire("error");
        if (this._readyState !== 1) this._fire("loadend");
      },
    );
  }

  _fire(type: string, loaded = 0, total = 0): void {
    const ProgressEvent = eventInterface("ProgressEvent");
    this.dispatchEvent(new ProgressEvent(type, { lengthComputable: total > 0, loaded, total }) as never);
  }
}

// https://w3c.github.io/FileAPI/#dfn-onloadstart and siblings
for (const type of ["loadstart", "progress", "load", "abort", "error", "loadend"]) {
  Object.defineProperty(FileReader.prototype, `on${type}`, {
    get(this: FileReader) {
      return getEventHandler(this, type);
    },
    set(this: FileReader, value: unknown) {
      setEventHandler(this, type, value);
    },
    enumerable: true,
    configurable: true,
  });
}
for (const [name, value] of [["EMPTY", 0], ["LOADING", 1], ["DONE", 2]] as const) {
  Object.defineProperty(FileReader.prototype, name, { value, enumerable: true });
}

/** https://w3c.github.io/FileAPI/#packaging-data */
function packageData(buffer: ArrayBuffer, kind: ReadKind, type: string, encoding: string | undefined): string | ArrayBuffer {
  switch (kind) {
    case "ArrayBuffer":
      return buffer;
    case "BinaryString": {
      const bytes = new Uint8Array(buffer);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return s;
    }
    case "Text": {
      let label = "utf-8";
      if (encoding !== undefined) {
        try {
          label = new TextDecoder(encoding).encoding;
        } catch {
          // Invalid labels fall back to UTF-8 (https://w3c.github.io/FileAPI/#encoding-determination).
        }
      }
      return new TextDecoder(label).decode(buffer);
    }
    case "DataURL":
      return `data:${type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
  }
}
