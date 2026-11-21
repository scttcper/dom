/**
 * Shared accessor pairs for React's per-object accessors (window/shared-accessors.ts). Not a spec
 * algorithm: `installGlobals` wraps the realm's `Object.defineProperty`
 * (https://tc39.es/ecma262/#sec-object.defineproperty) so the `key` warning getter React's
 * development build defines on props, and the `value`/`checked` accessor its value tracker defines
 * on inputs and textareas, are one function pair for every object. V8 then keeps those objects'
 * hidden classes; what a caller observes must not change.
 */
import { constants as vmConstants, createContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { createWindow, installGlobals } from "@ctrl/dom";
import type { HTMLInputElement, HTMLTextAreaElement } from "@ctrl/dom";
import { captureInterfaceBaseline, guardInterfaceDefinitions } from "@ctrl/dom/internal";

type Realm = { Object: ObjectConstructor; Reflect: typeof Reflect };

/** A test file's own realm with a window installed on it, as the environments make one. */
function realmWithWindow(guard = false) {
  const realm = createContext(vmConstants.DONT_CONTEXTIFY) as unknown as Realm & Record<PropertyKey, unknown>;
  const native = realm.Object.defineProperty;
  const window = createWindow();
  const uninstall = installGlobals(window, realm);
  if (guard) {
    captureInterfaceBaseline();
    guardInterfaceDefinitions(realm);
  }
  return { realm, native, window, uninstall };
}

/** What react.development.js's defineKeyPropWarningGetter does. */
function defineKeyWarning(realm: Realm, props: object, displayName: string, warnings: string[]) {
  const warnAboutAccessingKey = function (this: unknown) {
    warnings.push(`${displayName}: \`key\` is not a prop.`);
  } as (() => void) & { isReactWarning?: boolean };
  warnAboutAccessingKey.isReactWarning = true;
  realm.Object.defineProperty(props, "key", { get: warnAboutAccessingKey, configurable: true });
  return warnAboutAccessingKey;
}

/** What react-dom's trackValueOnNode does (inputValueTracking). */
function track(realm: Realm, node: object, field: "value" | "checked") {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), field)!;
  const calls: string[] = [];
  realm.Object.defineProperty(node, field, {
    configurable: true,
    get(this: object) {
      calls.push("get");
      return descriptor.get!.call(this);
    },
    set(this: object, value: unknown) {
      calls.push(`set ${String(value)}`);
      descriptor.set!.call(this, value);
    },
  });
  realm.Object.defineProperty(node, field, { enumerable: descriptor.enumerable });
  return calls;
}

describe.each([
  ["installGlobals' wrapper", false],
  ["the interface guard's wrapper (window/isolation.ts)", true],
])("React's key warning getter through %s", (_name, guard) => {
  test("every props object gets the same getter, which calls the one React defined for it", () => {
    const { realm, window, uninstall } = realmWithWindow(guard);
    const warnings: string[] = [];
    const a = { className: "row" } as { className: string; key?: unknown };
    const b = { className: "row" } as { className: string; key?: unknown };
    defineKeyWarning(realm, a, "li", warnings);
    defineKeyWarning(realm, b, "Row", warnings);
    const da = Object.getOwnPropertyDescriptor(a, "key")!;
    const db = Object.getOwnPropertyDescriptor(b, "key")!;
    expect(da.get).toBe(db.get);
    expect({ ...da, get: undefined }).toEqual({
      get: undefined,
      set: undefined,
      enumerable: false,
      configurable: true,
    });
    // React's hasValidKey() reads this mark off the getter.
    expect((da.get as { isReactWarning?: boolean }).isReactWarning).toBe(true);
    expect(b.key).toBeUndefined();
    expect(a.key).toBeUndefined();
    expect(warnings).toEqual(["Row: `key` is not a prop.", "li: `key` is not a prop."]);
    // Not enumerable, as React defines it: spreading props does not copy it.
    expect(Object.keys(a)).toEqual(["className"]);
    uninstall();
    window.close();
  });

  test("a key accessor that is not React's warning is defined as given", () => {
    const { realm, window, uninstall } = realmWithWindow(guard);
    const get = () => "k";
    const o = realm.Object.defineProperty({}, "key", { get, configurable: true });
    expect(Object.getOwnPropertyDescriptor(o, "key")!.get).toBe(get);
    const data = realm.Object.defineProperty({}, "key", { value: 1 });
    expect(Object.getOwnPropertyDescriptor(data, "key")).toEqual({
      value: 1,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    uninstall();
    window.close();
  });
});

describe.each([
  ["installGlobals' wrapper", false],
  ["the interface guard's wrapper (window/isolation.ts)", true],
])("React's value tracker through %s", (_name, guard) => {
  test("reads and writes of a tracked input go through React's accessor, on one shared pair", () => {
    const { realm, window, uninstall } = realmWithWindow(guard);
    const first = window.document.createElement("input") as HTMLInputElement;
    const second = window.document.createElement("input") as HTMLInputElement;
    const firstCalls = track(realm, first, "value");
    const secondCalls = track(realm, second, "value");
    const d1 = Object.getOwnPropertyDescriptor(first, "value")!;
    const d2 = Object.getOwnPropertyDescriptor(second, "value")!;
    expect(d1.get).toBe(d2.get);
    expect(d1.set).toBe(d2.set);
    expect(d1.configurable).toBe(true);
    expect(d1.enumerable).toBe(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(first), "value")!.enumerable);
    first.value = "one";
    second.value = "two";
    expect([first.value, second.value]).toEqual(["one", "two"]);
    expect(firstCalls).toEqual(["set one", "get"]);
    expect(secondCalls).toEqual(["set two", "get"]);
    // stopTracking(): the prototype's accessor is back.
    delete (first as unknown as Record<string, unknown>).value;
    first.value = "three";
    expect(first.value).toBe("three");
    expect(firstCalls).toEqual(["set one", "get"]);
    uninstall();
    window.close();
  });

  test("checked on a checkbox and value on a textarea are tracked the same way", () => {
    const { realm, window, uninstall } = realmWithWindow(guard);
    const checkbox = window.document.createElement("input") as HTMLInputElement;
    checkbox.type = "checkbox";
    const textarea = window.document.createElement("textarea") as HTMLTextAreaElement;
    const checkboxCalls = track(realm, checkbox, "checked");
    const textareaCalls = track(realm, textarea, "value");
    checkbox.checked = true;
    textarea.value = "a\r\nb";
    expect(checkbox.checked).toBe(true);
    expect(textarea.value).toBe("a\nb");
    expect(checkboxCalls).toEqual(["set true", "get"]);
    expect(textareaCalls).toEqual(["set a\r\nb", "get"]);
    uninstall();
    window.close();
  });

  test("a descriptor read off the element and defined again (stock user-event's interceptor) keeps React's functions", () => {
    const { realm, window, uninstall } = realmWithWindow(guard);
    const input = window.document.createElement("input") as HTMLInputElement;
    const calls = track(realm, input, "value");
    // @testing-library/user-event's prepareInterceptor: wrap the own setter, spread the rest.
    const own = Object.getOwnPropertyDescriptor(input, "value")!;
    const intercepted: unknown[] = [];
    realm.Object.defineProperty(input, "value", {
      ...own,
      set(this: object, value: unknown) {
        intercepted.push(value);
        own.set!.call(this, value);
      },
    });
    input.value = "typed";
    expect(input.value).toBe("typed");
    expect(intercepted).toEqual(["typed"]);
    expect(calls).toEqual(["set typed", "get"]);
    uninstall();
    window.close();
  });

  test("other objects and other accessors are defined as given", () => {
    const { realm, window, uninstall } = realmWithWindow(guard);
    const get = () => 1;
    const set = () => {};
    const plain = realm.Object.defineProperty({}, "value", { get, set, configurable: true });
    expect(Object.getOwnPropertyDescriptor(plain, "value")).toEqual({
      get,
      set,
      enumerable: false,
      configurable: true,
    });
    // An enumerable accessor is not what the tracker defines.
    const input = window.document.createElement("input") as HTMLInputElement;
    realm.Object.defineProperty(input, "value", { get, set, configurable: true, enumerable: true });
    expect(Object.getOwnPropertyDescriptor(input, "value")).toEqual({ get, set, enumerable: true, configurable: true });
    uninstall();
    window.close();
  });
});

describe("installing and uninstalling", () => {
  test("uninstall restores the realm's Object.defineProperty; nested installs share one wrapper", () => {
    const realm = createContext(vmConstants.DONT_CONTEXTIFY) as unknown as Realm & Record<PropertyKey, unknown>;
    const native = realm.Object.defineProperty;
    const outer = createWindow();
    const inner = createWindow();
    const uninstallOuter = installGlobals(outer, realm);
    const wrapper = realm.Object.defineProperty;
    expect(wrapper).not.toBe(native);
    expect([wrapper.name, wrapper.length]).toEqual([native.name, native.length]);
    const uninstallInner = installGlobals(inner, realm);
    expect(realm.Object.defineProperty).toBe(wrapper);
    uninstallInner();
    expect(realm.Object.defineProperty).toBe(wrapper);
    uninstallOuter();
    expect(realm.Object.defineProperty).toBe(native);
    expect(Object.getOwnPropertyDescriptor(realm.Object, "defineProperty")).toEqual({
      value: native,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    inner.close();
    outer.close();
  });

  test("a target that is not a realm's global is left alone", () => {
    const window = createWindow();
    const target: Record<PropertyKey, unknown> = {};
    const uninstall = installGlobals(window, target);
    expect(target.document).toBe(window.document);
    uninstall();
    window.close();
  });
});
