/**
 * DataTransfer, DataTransferItemList, DataTransferItem.
 *
 * Spec: HTML §6.11.3 "The DataTransfer interface" and following
 *   https://html.spec.whatwg.org/#the-datatransfer-interface
 *   https://html.spec.whatwg.org/#the-datatransferitemlist-interface
 *   https://html.spec.whatwg.org/#the-datatransferitem-interface
 *
 * Written from the spec (WPT html/editing/dnd needs real drag operations), plus the usage
 * patterns of @testing-library/user-event (setData/getData, items.add(file), files, types).
 */
import { describe, expect, test } from "vitest";
import { DataTransfer, DataTransferItem, DataTransferItemList } from "@ctrl/dom";

describe("DataTransfer — https://html.spec.whatwg.org/#the-datatransfer-interface", () => {
  test("constructor: empty store, dropEffect none, effectAllowed uninitialized", () => {
    const dt = new DataTransfer();
    expect(dt.dropEffect).toBe("none");
    expect(dt.effectAllowed).toBe("uninitialized");
    expect(dt.types).toEqual([]);
    expect(dt.items.length).toBe(0);
    expect(dt.files.length).toBe(0);
  });

  test("dropEffect / effectAllowed only accept their keyword values", () => {
    const dt = new DataTransfer();
    dt.dropEffect = "copy";
    expect(dt.dropEffect).toBe("copy");
    dt.dropEffect = "bogus";
    expect(dt.dropEffect).toBe("copy");
    dt.effectAllowed = "copyMove";
    expect(dt.effectAllowed).toBe("copyMove");
    dt.effectAllowed = "nope";
    expect(dt.effectAllowed).toBe("copyMove");
  });

  test("setData/getData: format is lowercased; text → text/plain; url → first URL of text/uri-list", () => {
    const dt = new DataTransfer();
    dt.setData("Text", "hello");
    expect(dt.getData("text/plain")).toBe("hello");
    expect(dt.getData("TEXT")).toBe("hello");
    dt.setData("text/uri-list", "# comment\nhttp://a.example/\nhttp://b.example/");
    expect(dt.getData("URL")).toBe("http://a.example/");
    expect(dt.getData("text/uri-list")).toContain("# comment");
    expect(dt.getData("application/x-missing")).toBe("");
  });

  test("setData replaces an existing item of the same type (moved to the end)", () => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "a");
    dt.setData("text/html", "<b>");
    dt.setData("text/plain", "b");
    expect(dt.types).toEqual(["text/html", "text/plain"]);
    expect(dt.getData("text/plain")).toBe("b");
  });

  test("clearData(format) removes that string item; clearData() removes all string items", () => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "a");
    dt.setData("text/html", "b");
    const file = new File(["x"], "x.txt", { type: "text/plain" });
    dt.items.add(file);
    dt.clearData("text/plain");
    expect(dt.types).toEqual(["text/html", "Files"]);
    dt.clearData();
    expect(dt.types).toEqual(["Files"]);
    expect(dt.files[0]).toBe(file);
  });

  test("types is a frozen array with string types first and 'Files' last", () => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "a.png", { type: "image/png" }));
    dt.setData("text/plain", "t");
    expect(dt.types).toEqual(["text/plain", "Files"]);
    expect(Object.isFrozen(dt.types)).toBe(true);
    expect(dt.types).toBe(dt.types);
  });

  test("files lists file items; it can be overridden with defineProperty (user-event pattern)", () => {
    const dt = new DataTransfer();
    const a = new File(["a"], "a.txt");
    const b = new File(["b"], "b.txt");
    dt.items.add(a);
    dt.items.add(b);
    expect(dt.files.length).toBe(2);
    expect([...dt.files]).toEqual([a, b]);
    expect(dt.files.item(1)).toBe(b);
    Object.defineProperty(dt, "files", { get: () => ["override"] });
    expect(dt.files).toEqual(["override"]);
  });

  test("setDragImage is a no-op", () => {
    expect(new DataTransfer().setDragImage({}, 0, 0)).toBeUndefined();
  });
});

describe("DataTransferItemList — https://html.spec.whatwg.org/#the-datatransferitemlist-interface", () => {
  test("add(string, type) lowercases the type but does not map text/url; duplicates throw NotSupportedError", () => {
    const dt = new DataTransfer();
    const item = dt.items.add("hi", "Text")!;
    expect(item.kind).toBe("string");
    expect(item.type).toBe("text");
    expect(() => dt.items.add("again", "TEXT")).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
  });

  test("add(file) creates a file item; indexed access, remove and clear", () => {
    const dt = new DataTransfer();
    const file = new File(["x"], "x.PNG", { type: "image/PNG" });
    const item = dt.items.add(file)!;
    dt.items.add("s", "text/plain");
    expect(item.kind).toBe("file");
    expect(item.type).toBe("image/png");
    expect(item.getAsFile()).toBe(file);
    expect(dt.items[0]).toBe(item);
    expect(dt.items.length).toBe(2);
    dt.items.remove(0);
    expect(dt.items.length).toBe(1);
    expect(dt.items[0].kind).toBe("string");
    expect(dt.items[1]).toBeUndefined();
    expect(item.kind).toBe("");
    dt.items.clear();
    expect(dt.items.length).toBe(0);
    expect(dt.items[0]).toBeUndefined();
  });

  test("add with a non-File single argument throws TypeError", () => {
    expect(() => new DataTransfer().items.add({} as never)).toThrow(TypeError);
  });

  test("items and lists have no public constructors", () => {
    expect(() => new (DataTransferItemList as unknown as new () => object)()).toThrow(TypeError);
    expect(() => new (DataTransferItem as unknown as new () => object)()).toThrow(TypeError);
  });
});

describe("DataTransferItem — https://html.spec.whatwg.org/#the-datatransferitem-interface", () => {
  test("getAsString calls back asynchronously with the data (string items only)", async () => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "payload");
    const item = dt.items[0];
    let sync = true;
    const value = await new Promise<string>((resolve) => {
      item.getAsString((s) => {
        expect(sync).toBe(false);
        resolve(s);
      });
      sync = false;
    });
    expect(value).toBe("payload");
    expect(item.getAsFile()).toBeNull();
    let called = false;
    dt.items.add(new File([""], "f"));
    dt.items[1].getAsString(() => (called = true));
    await Promise.resolve();
    expect(called).toBe(false);
  });
});
