// https://w3c.github.io/FileAPI/#filelist-section
//
// A leaf module (no EventTarget dependency): DataTransfer and <input type=file> import it
// while the events modules are still evaluating.

const kConstruct = Symbol("FileList");

/** https://w3c.github.io/FileAPI/#filelist-section */
export class FileList {
  declare readonly length: number;
  [index: number]: File;

  constructor(token?: symbol, files?: readonly File[]) {
    if (token !== kConstruct) throw new TypeError("Illegal constructor");
    const list = files ?? [];
    for (let i = 0; i < list.length; i++) {
      Object.defineProperty(this, i, { value: list[i], enumerable: true, configurable: false, writable: false });
    }
    Object.defineProperty(this, "length", {
      value: list.length,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  item(index: number): File | null {
    const i = Number(index) >>> 0;
    return i < this.length ? this[i] : null;
  }

  *[Symbol.iterator](): IterableIterator<File> {
    for (let i = 0; i < this.length; i++) yield this[i];
  }

  get [Symbol.toStringTag](): string {
    return "FileList";
  }
}

/** Create a FileList (for <input type=file>, DataTransfer, ...). */
export function createFileList(files: readonly File[]): FileList {
  return new FileList(kConstruct, files);
}
