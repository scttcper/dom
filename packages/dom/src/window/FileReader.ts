// https://w3c.github.io/FileAPI/#APIASynch (FileReader)
//
// Built on Node's Blob/File. Reads complete asynchronously (promise jobs rather than tasks, so
// fake timers never stall them).

import { EventTarget } from "../events/EventTarget.ts";
import { defineEventHandlers } from "../events/handlers.ts";
import { eventInterface } from "./interfaces.ts";
import { $error, $generation, $readyState, $result } from "../keys.ts";

type ReadKind = "ArrayBuffer" | "BinaryString" | "Text" | "DataURL";

interface ReadOperation {
  reader: FileReader | null;
  source: Blob | null;
}

function finishRead(reader: FileReader): void {
  const operation = reader[$generation]!;
  operation.reader = null;
  operation.source = null;
  reader[$generation] = null;
  reader[$readyState] = 2;
}

export class FileReader extends EventTarget {
  static readonly EMPTY = 0;
  static readonly LOADING = 1;
  static readonly DONE = 2;

  [$readyState]: number;
  [$result]: string | ArrayBuffer | null;
  [$error]: DOMException | null;
  /** Abort disconnects pending byte callbacks from this reader and its source. */
  [$generation]: ReadOperation | null;

  constructor() {
    super();
    this[$readyState] = 0;
    this[$result] = null;
    this[$error] = null;
    this[$generation] = null;
  }

  get readyState(): number {
    return this[$readyState];
  }
  get result(): string | ArrayBuffer | null {
    return this[$result];
  }
  get error(): DOMException | null {
    return this[$error];
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
    if (this[$readyState] === 0 || this[$readyState] === 2) {
      this[$result] = null;
      return;
    }
    finishRead(this);
    this[$result] = null;
    this._fire("abort");
    if (this[$readyState] !== 1) this._fire("loadend");
  }

  /** https://w3c.github.io/FileAPI/#readOperation */
  _read(blob: Blob, kind: ReadKind, encoding?: string): void {
    if (!(blob instanceof Blob)) {
      throw new TypeError(`Failed to execute 'readAs${kind}' on 'FileReader': parameter 1 is not of type 'Blob'.`);
    }
    // Step 1: InvalidStateError while a read is in progress.
    if (this[$readyState] === 1) {
      throw new DOMException(
        "Failed to execute 'readAs" + kind + "' on 'FileReader': The object is already busy reading Blobs.",
        "InvalidStateError",
      );
    }
    this[$readyState] = 1;
    this[$result] = null;
    this[$error] = null;
    const operation: ReadOperation = { reader: this, source: kind === "DataURL" ? blob : null };
    this[$generation] = operation;
    queueMicrotask(() => operation.reader?._fire("loadstart"));
    blob.arrayBuffer().then(
      (buffer) => {
        const reader = operation.reader;
        if (reader === null) return;
        const total = buffer.byteLength;
        reader._fire("progress", total, total);
        if (operation.reader === null) return;
        const source = operation.source;
        finishRead(reader);
        reader[$result] = packageData(buffer, kind, source?.type ?? "", encoding);
        reader._fire("load", total, total);
        if (reader[$readyState] !== 1) reader._fire("loadend", total, total);
      },
      (error: unknown) => {
        const reader = operation.reader;
        if (reader === null) return;
        finishRead(reader);
        reader[$error] = error instanceof DOMException ? error : new DOMException(String(error), "NotReadableError");
        reader._fire("error");
        if (reader[$readyState] !== 1) reader._fire("loadend");
      },
    );
  }

  _fire(type: string, loaded = 0, total = 0): void {
    const ProgressEvent = eventInterface("ProgressEvent");
    this.dispatchEvent(new ProgressEvent(type, { lengthComputable: total > 0, loaded, total }) as never);
  }
}

// https://w3c.github.io/FileAPI/#dfn-onloadstart and siblings
defineEventHandlers(FileReader.prototype, ["loadstart", "progress", "load", "abort", "error", "loadend"]);
for (const [name, value] of [
  ["EMPTY", 0],
  ["LOADING", 1],
  ["DONE", 2],
] as const) {
  Object.defineProperty(FileReader.prototype, name, { value, enumerable: true });
}

/** https://w3c.github.io/FileAPI/#packaging-data */
function packageData(
  buffer: ArrayBuffer,
  kind: ReadKind,
  type: string,
  encoding: string | undefined,
): string | ArrayBuffer {
  switch (kind) {
    case "ArrayBuffer":
      return buffer;
    case "BinaryString":
      return Buffer.from(buffer).toString("latin1");
    case "Text": {
      let decoder: TextDecoder;
      try {
        decoder = new TextDecoder(encoding);
      } catch {
        // Invalid labels fall back to UTF-8 (https://w3c.github.io/FileAPI/#encoding-determination).
        decoder = new TextDecoder();
      }
      return decoder.decode(buffer);
    }
    case "DataURL":
      return `data:${type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
  }
}
