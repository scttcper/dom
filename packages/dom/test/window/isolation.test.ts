/**
 * Per-file interface isolation (window/isolation.ts, docs/deviations.md "Interface objects are
 * shared by every test file in a worker"). Not a spec algorithm: environments snapshot the
 * shared interface objects (https://webidl.spec.whatwg.org/#es-interfaces) once and undo test
 * files' patches at teardown.
 */
import { constants as vmConstants, createContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { captureInterfaceBaseline, guardInterfaceDefinitions, restoreInterfaces } from "@ctrl/dom/internal";

describe("restoreInterfaces", () => {
  test("keeps the index getters collections grow on demand (downstream/sentry TRIAGE #1)", () => {
    captureInterfaceBaseline();
    const file = () => {
      const window = createWindow();
      const div = window.document.createElement("div");
      // More children than the initial index-getter bound (32): the table grows after the baseline.
      div.innerHTML = Array.from({ length: 40 }, (_, i) => `<span>${i}</span>`).join("");
      const seen = [
        div.children[0]?.textContent,
        div.children[39]?.textContent,
        div.getElementsByTagName("span")[39]?.textContent,
      ];
      window.close();
      restoreInterfaces();
      return seen;
    };
    expect([file(), file(), file()]).toEqual([
      ["0", "39", "39"],
      ["0", "39", "39"],
      ["0", "39", "39"],
    ]);
  });

  test("still undoes a test file's own patches", () => {
    captureInterfaceBaseline();
    const window = createWindow();
    const HTMLElement = (window as unknown as { HTMLElement: { prototype: Record<string, unknown> } }).HTMLElement;
    HTMLElement.prototype.scrollIntoViewPatched = () => {};
    window.close();
    restoreInterfaces();
    expect("scrollIntoViewPatched" in HTMLElement.prototype).toBe(false);
  });

  test("restores removed and reordered keys even when the own-key count is unchanged", () => {
    captureInterfaceBaseline();
    const window = createWindow();
    const HTMLElement = (window as unknown as { HTMLElement: { prototype: Record<PropertyKey, unknown> } }).HTMLElement;
    const proto = HTMLElement.prototype;
    const focus = Object.getOwnPropertyDescriptor(proto, "focus")!;
    const hidden = Object.getOwnPropertyDescriptor(proto, "hidden")!;
    const added = Symbol("added by a test file");
    const count = Reflect.ownKeys(proto).length;
    delete proto.focus;
    Object.defineProperty(proto, "focus", { ...focus, value: () => {} });
    delete proto.hidden;
    proto[added] = () => {};
    expect(Reflect.ownKeys(proto)).toHaveLength(count);
    window.close();
    restoreInterfaces();
    expect(Object.getOwnPropertyDescriptor(proto, "focus")).toEqual(focus);
    expect(Object.getOwnPropertyDescriptor(proto, "hidden")).toEqual(hidden);
    expect(Object.hasOwn(proto, added)).toBe(false);
    expect(restoreInterfaces()).toBe(0);
  });

  test("definitions made through a guarded realm stay configurable, so they are undone (downstream/react-aria TRIAGE)", () => {
    captureInterfaceBaseline();
    // A test file's own realm, as the environments create it.
    const realm = createContext(vmConstants.DONT_CONTEXTIFY) as unknown as {
      Object: ObjectConstructor;
      Reflect: typeof Reflect;
    };
    guardInterfaceDefinitions(realm);
    const window = createWindow();
    const { ShadowRoot, Element } = window as unknown as {
      ShadowRoot: { prototype: object };
      Element: { prototype: object };
    };
    // shadow-dom-testing-library: Object.defineProperties without `configurable`.
    realm.Object.defineProperties(ShadowRoot.prototype, { outerHTML: { get: () => "patched" } });
    realm.Object.defineProperty(Element.prototype, "patchedOne", { value: 1 });
    realm.Reflect.defineProperty(Element.prototype, "patchedTwo", { value: 2 });
    expect(Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "outerHTML")!.configurable).toBe(true);
    // Objects that are not interfaces keep the usual defaults.
    const plain = realm.Object.defineProperty({}, "x", { value: 1 });
    expect(Object.getOwnPropertyDescriptor(plain, "x")!.configurable).toBe(false);
    window.close();
    restoreInterfaces();
    expect(Object.hasOwn(ShadowRoot.prototype, "outerHTML")).toBe(false);
    expect("patchedOne" in Element.prototype || "patchedTwo" in Element.prototype).toBe(false);
  });
});
