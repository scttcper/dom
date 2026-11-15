/**
 * Interface object shape: class strings, constants, absent members, hidden internals.
 *
 * Specs:
 *   WebIDL class string — https://webidl.spec.whatwg.org/#dfn-class-string
 *   WebIDL constants — https://webidl.spec.whatwg.org/#es-constants
 *   HTML media element — https://html.spec.whatwg.org/#htmlmediaelement
 *   HTML track element — https://html.spec.whatwg.org/#htmltrackelement
 *   HTML MediaError — https://html.spec.whatwg.org/#mediaerror
 *
 * Feature detection reads these: `Object.prototype.toString` type checks, `video.readyState >=
 * video.HAVE_CURRENT_DATA`, `"captureStream" in canvas`. A member that exists only to throw or
 * never call back is worse than an absent one, since code written for jsdom falls back on absence.
 * Internals stay non-enumerable so spreads, Jest's equality and its diff printer skip them.
 */
import { describe, expect, test } from "vitest";
import * as dom from "@ctrl/dom";
import { createWindow } from "@ctrl/dom";

const tag = (x: unknown): string => Object.prototype.toString.call(x).slice(8, -1);

describe("class strings — https://webidl.spec.whatwg.org/#dfn-class-string", () => {
  test("every exported interface's prototype has its own name as class string", () => {
    const wrong: string[] = [];
    for (const [name, C] of Object.entries(dom)) {
      if (typeof C !== "function" || !/^[A-Z]/.test(name) || C.name !== name) continue;
      const proto = (C as { prototype?: { constructor?: unknown } }).prototype;
      // Aliases (SVGRect, WebKitCSSMatrix) and legacy factories (Audio, Image) name another interface.
      if (proto === undefined || proto.constructor !== C) continue;
      if (tag(Object.create(proto)) !== name) wrong.push(`${name}: ${tag(Object.create(proto))}`);
    }
    expect(wrong).toEqual([]);
  });

  test("instances that used to inherit EventTarget's or Object's tag", () => {
    const window = createWindow();
    const d = window.document;
    const objects = [
      [d, "Document"],
      [d.createTextNode("x"), "Text"],
      [d.createComment(""), "Comment"],
      [d.createDocumentFragment(), "DocumentFragment"],
      [d.doctype, "DocumentType"],
      [d.createAttribute("a"), "Attr"],
      [d.createElementNS("urn:x", "y"), "Element"],
      [new dom.XMLHttpRequest(), "XMLHttpRequest"],
      [new dom.XMLHttpRequest().upload, "XMLHttpRequestUpload"],
      [new dom.DOMParser(), "DOMParser"],
      [d.implementation, "DOMImplementation"],
      [window.customElements, "CustomElementRegistry"],
      [(d.createElement("select") as unknown as { options: unknown }).options, "HTMLOptionsCollection"],
    ] as const;
    expect(objects.map(([o]) => tag(o))).toEqual(objects.map(([, name]) => name));
    window.close();
  });
});

describe("constants on the prototype — https://webidl.spec.whatwg.org/#es-constants", () => {
  test("media, track and MediaError constants are on instances, read-only and non-configurable", () => {
    const window = createWindow();
    const video = window.document.createElement("video") as unknown as Record<string, number>;
    expect(video.HAVE_ENOUGH_DATA).toBe(4);
    expect(video.NETWORK_NO_SOURCE).toBe(3);
    expect(video.readyState >= video.HAVE_CURRENT_DATA).toBe(false);
    expect((window.document.createElement("track") as unknown as Record<string, number>).ERROR).toBe(3);
    for (const [C, name] of [
      [dom.HTMLMediaElement, "HAVE_NOTHING"],
      [dom.HTMLTrackElement, "LOADED"],
      [dom.MediaError, "MEDIA_ERR_DECODE"],
    ] as const) {
      for (const target of [C, C.prototype]) {
        expect(Object.getOwnPropertyDescriptor(target, name)).toMatchObject({
          writable: false,
          enumerable: true,
          configurable: false,
        });
      }
    }
    window.close();
  });
});

describe("no members that only throw or never call back", () => {
  test("canvas has no captureStream/transferControlToOffscreen and video no requestVideoFrameCallback, as in jsdom", () => {
    const window = createWindow();
    const canvas = window.document.createElement("canvas");
    expect("captureStream" in canvas).toBe(false);
    expect("transferControlToOffscreen" in canvas).toBe(false);
    const video = window.document.createElement("video");
    expect("requestVideoFrameCallback" in video).toBe(false);
    expect("cancelVideoFrameCallback" in video).toBe(false);
    window.close();
  });
});

describe("hidden internals", () => {
  const symbolsHidden = (o: object): boolean =>
    Reflect.ownKeys(o)
      .filter((k) => typeof k === "symbol")
      .every((k) => !Object.prototype.propertyIsEnumerable.call(o, k));

  test("Window, Document, DataTransfer and ValidityState keep internals as non-enumerable own symbols", () => {
    const window = createWindow();
    const doc = window.document.implementation.createHTMLDocument("x");
    const dt = new dom.DataTransfer();
    dt.setData("text/plain", "a");
    const validity = (window.document.createElement("input") as unknown as { validity: object }).validity;
    for (const o of [window, window.document, doc, dt, dt.items, dt.items[0], validity]) {
      expect(Reflect.ownKeys(o).some((k) => typeof k === "symbol")).toBe(true);
      expect(symbolsHidden(o)).toBe(true);
      // Internal fields are writable and configurable (environments reset and patch them).
      for (const k of Reflect.ownKeys(o).filter((k) => typeof k === "symbol")) {
        expect(Object.getOwnPropertyDescriptor(o, k)).toMatchObject({ writable: true, configurable: true });
      }
    }
    expect({ ...dt }).toEqual({});
    expect(Object.keys(validity)).toEqual([]);
    window.close();
  });
});
