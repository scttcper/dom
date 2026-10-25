/**
 * Web Storage.
 *
 * Spec: HTML Standard §12 "Web storage"
 *   https://html.spec.whatwg.org/#the-storage-interface
 *   https://html.spec.whatwg.org/#the-localstorage-attribute
 *   https://html.spec.whatwg.org/#the-sessionstorage-attribute
 *   https://html.spec.whatwg.org/#the-storageevent-interface
 *   https://html.spec.whatwg.org/#concept-storage-broadcast
 *
 * Implementation note: each window has its own storage shed unless created with
 * `shareStorageWith` (models two same-origin tabs), so tests are isolated by default.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow, Storage, type Window } from "@ctrl/dom";

let window: Window;

beforeEach(() => {
  window = createWindow({ url: "http://localhost:3000/" });
});

afterEach(() => {
  window.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Storage methods — https://html.spec.whatwg.org/#the-storage-interface", () => {
  test("setItem/getItem/removeItem/clear/length/key", () => {
    const s = window.localStorage;
    expect(s.length).toBe(0);
    expect(s.getItem("missing")).toBeNull();
    s.setItem("a", "1");
    s.setItem("b", "2");
    expect(s.length).toBe(2);
    expect(s.getItem("a")).toBe("1");
    expect(s.key(0)).toBe("a");
    expect(s.key(1)).toBe("b");
    expect(s.key(2)).toBeNull();
    s.removeItem("a");
    expect(s.getItem("a")).toBeNull();
    s.clear();
    expect(s.length).toBe(0);
  });

  test("values and keys are converted to strings", () => {
    const s = window.localStorage;
    s.setItem("n", 42 as never);
    s.setItem(1 as never, { toString: () => "obj" } as never);
    expect(s.getItem("n")).toBe("42");
    expect(s.getItem("1")).toBe("obj");
  });

  test("setItem over quota throws QuotaExceededError", () => {
    expect(() => window.localStorage.setItem("big", "x".repeat(5_000_001))).toThrow(
      expect.objectContaining({ name: "QuotaExceededError" }),
    );
  });

  test("Storage is not constructible", () => {
    expect(() => new (Storage as unknown as new () => unknown)()).toThrow(TypeError);
  });

  test("instances are Storage and stable per window", () => {
    expect(window.localStorage).toBeInstanceOf(Storage);
    expect(window.localStorage).toBe(window.localStorage);
    expect(window.sessionStorage).not.toBe(window.localStorage);
    expect(Object.prototype.toString.call(window.localStorage)).toBe("[object Storage]");
  });

  test("windows do not share storage unless asked to", () => {
    window.localStorage.setItem("k", "v");
    const other = createWindow({ url: "http://localhost:3000/" });
    expect(other.localStorage.getItem("k")).toBeNull();
    const tab = createWindow({ url: "http://localhost:3000/", shareStorageWith: window });
    expect(tab.localStorage.getItem("k")).toBe("v");
  });

  test("vi.spyOn(Storage.prototype, 'setItem') observes calls", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    window.localStorage.setItem("x", "y");
    expect(spy).toHaveBeenCalledWith("x", "y");
  });

  test("vi.spyOn(localStorage, 'getItem') shadows the method on the instance", () => {
    const spy = vi.spyOn(window.localStorage, "getItem").mockReturnValue("mocked");
    expect(window.localStorage.getItem("anything")).toBe("mocked");
    spy.mockRestore();
    expect(window.localStorage.getItem("anything")).toBeNull();
  });
});

describe("named properties — https://html.spec.whatwg.org/#the-storage-interface (supported property names)", () => {
  test("named getter/setter/deleter map to getItem/setItem/removeItem", () => {
    const s = window.localStorage as unknown as Record<string, unknown>;
    s.foo = 1;
    expect(window.localStorage.getItem("foo")).toBe("1");
    expect(s.foo).toBe("1");
    expect("foo" in s).toBe(true);
    delete s.foo;
    expect(window.localStorage.getItem("foo")).toBeNull();
    expect(s.foo).toBeUndefined();
  });

  test("Object.keys lists stored keys in insertion order", () => {
    window.localStorage.setItem("b", "1");
    window.localStorage.setItem("a", "2");
    expect(Object.keys(window.localStorage)).toEqual(["b", "a"]);
    expect({ ...window.localStorage }).toEqual({ b: "1", a: "2" });
  });

  test("prototype members win over stored keys of the same name", () => {
    window.localStorage.setItem("getItem", "shadow?");
    expect(typeof window.localStorage.getItem).toBe("function");
    expect(window.localStorage.getItem("getItem")).toBe("shadow?");
  });
});

describe("storage events — https://html.spec.whatwg.org/#concept-storage-broadcast", () => {
  test("changes fire `storage` at other windows sharing the area, not at the source", () => {
    vi.useFakeTimers();
    const tab = createWindow({ url: "http://localhost:3000/other", shareStorageWith: window });
    const own = vi.fn();
    const events: Record<string, unknown>[] = [];
    window.addEventListener("storage", own);
    tab.addEventListener("storage", (e) => events.push(e as never));
    window.localStorage.setItem("k", "v1");
    window.localStorage.setItem("k", "v1"); // unchanged: no event
    window.localStorage.setItem("k", "v2");
    window.localStorage.removeItem("k");
    window.localStorage.clear(); // already empty: no event
    vi.runAllTimers();
    expect(own).not.toHaveBeenCalled();
    expect(events.map((e) => [e.key, e.oldValue, e.newValue])).toEqual([
      ["k", null, "v1"],
      ["k", "v1", "v2"],
      ["k", "v2", null],
    ]);
    expect(events[0].url).toBe("http://localhost:3000/");
    expect(events[0].storageArea).toBe(tab.localStorage);
    tab.close();
  });

  test("clear() fires an event with null key", () => {
    vi.useFakeTimers();
    const tab = createWindow({ url: "http://localhost:3000/", shareStorageWith: window });
    window.localStorage.setItem("a", "1");
    vi.runAllTimers();
    const events: Record<string, unknown>[] = [];
    tab.addEventListener("storage", (e) => events.push(e as never));
    window.localStorage.clear();
    vi.runAllTimers();
    expect(events).toHaveLength(1);
    expect(events[0].key).toBeNull();
    tab.close();
  });

  test("sessionStorage changes are not broadcast", () => {
    vi.useFakeTimers();
    const tab = createWindow({ url: "http://localhost:3000/", shareStorageWith: window });
    const spy = vi.fn();
    tab.addEventListener("storage", spy);
    window.sessionStorage.setItem("a", "1");
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
    tab.close();
  });

  test("sessionStorage changes are not broadcast to other tabs", () => {
    vi.useFakeTimers();
    const tab = createWindow({ url: "http://localhost:3000/", shareStorageWith: window });
    window.sessionStorage.setItem("x", "1");
    expect(tab.sessionStorage.getItem("x")).toBeNull();
    tab.close();
  });
});

describe("Frames share storage — https://html.spec.whatwg.org/#concept-storage-broadcast", () => {
  function frameOf(w: Window): Window {
    const doc = w.document as unknown as { createElement(n: string): { contentWindow: Window }; body: { appendChild<T>(n: T): T } };
    return doc.body.appendChild(doc.createElement("iframe")).contentWindow;
  }

  test("an about:blank iframe inherits the parent's origin and shares local and session storage", () => {
    const frame = frameOf(window);
    expect(frame.origin).toBe("http://localhost:3000");
    expect(frame.location.origin).toBe("null");
    window.localStorage.setItem("l", "1");
    window.sessionStorage.setItem("s", "2");
    expect(frame.localStorage.getItem("l")).toBe("1");
    expect(frame.sessionStorage.getItem("s")).toBe("2");
  });

  test("local and session mutations fire storage events at the other frames, not the source", () => {
    vi.useFakeTimers();
    const frame = frameOf(window);
    const inFrame: unknown[] = [];
    const inParent: unknown[] = [];
    frame.addEventListener("storage", (e) => inFrame.push((e as unknown as { storageArea: unknown }).storageArea));
    window.addEventListener("storage", (e) => inParent.push(e));
    window.localStorage.setItem("a", "1");
    window.sessionStorage.setItem("b", "2");
    vi.runAllTimers();
    expect(inFrame).toEqual([frame.localStorage, frame.sessionStorage]);
    expect(inParent).toHaveLength(0);
  });
});

describe("Storage legacy platform object — https://webidl.spec.whatwg.org/#es-legacy-platform-objects", () => {
  test("methods require their arguments (WebIDL overload resolution)", () => {
    const s = window.localStorage as unknown as Record<string, (...a: unknown[]) => unknown>;
    expect(() => s.getItem()).toThrow(TypeError);
    expect(() => s.setItem("a")).toThrow("Failed to execute 'setItem' on 'Storage': 2 arguments required, but only 1 present.");
  });

  test("[[Set]] of a String always calls the named setter; prototype members stay visible", () => {
    const s = window.localStorage as unknown as Record<string, unknown>;
    s.key = "k";
    expect(typeof s.key).toBe("function");
    expect(window.localStorage.getItem("key")).toBe("k");
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  test("QuotaExceededError is the host's QuotaExceededError (a DOMException)", () => {
    let error: unknown;
    try {
      window.localStorage.setItem("big", "x".repeat(5_000_001));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DOMException);
    expect((error as { constructor: unknown }).constructor).toBe((window as unknown as { QuotaExceededError: unknown }).QuotaExceededError);
    expect((error as { quota: unknown }).quota).toBeNull();
  });
});
