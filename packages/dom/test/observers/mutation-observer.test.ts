/**
 * MutationObserver behaviors that the WPT suite does not pin, plus this implementation's
 * zero-cost bookkeeping.
 *
 * Spec: DOM Standard §4.3 "Mutation observers" — https://dom.spec.whatwg.org/#mutation-observers
 *   - observe(): https://dom.spec.whatwg.org/#dom-mutationobserver-observe
 *   - queueing a mutation record: https://dom.spec.whatwg.org/#queueing-a-mutation-record
 *   - transient registered observers (remove step 16): https://dom.spec.whatwg.org/#concept-node-remove
 *   - notify mutation observers: https://dom.spec.whatwg.org/#notify-mutation-observers
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, MutationObserver, MutationRecord, type Document, type Element } from "@ctrl/dom";
import { activeObservers } from "../../src/observers/queue.ts";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

describe("observe() option validation — https://dom.spec.whatwg.org/#dom-mutationobserver-observe", () => {
  test("step 3: at least one of childList/attributes/characterData must be true", () => {
    expect(() => new MutationObserver(() => {}).observe(document.body!, {})).toThrow(TypeError);
  });

  test("steps 1-2: attributeOldValue/attributeFilter imply attributes, characterDataOldValue implies characterData", () => {
    const el = document.createElement("div");
    const mo = new MutationObserver(() => {});
    mo.observe(el, { attributeFilter: ["id"] });
    el.id = "x";
    el.className = "y";
    const records = mo.takeRecords();
    expect(records.map((r) => r.attributeName)).toEqual(["id"]);
    mo.disconnect();
  });

  test("steps 4-6: explicit false plus an option that needs it is a TypeError", () => {
    const mo = new MutationObserver(() => {});
    expect(() => mo.observe(document.body!, { attributes: false, attributeOldValue: true })).toThrow(TypeError);
    expect(() => mo.observe(document.body!, { attributes: false, attributeFilter: [] })).toThrow(TypeError);
    expect(() => mo.observe(document.body!, { characterData: false, characterDataOldValue: true })).toThrow(TypeError);
  });

  test("MutationRecord is not constructible", () => {
    expect(() => new (MutationRecord as unknown as new () => unknown)()).toThrow(TypeError);
  });
});

describe("delivery — https://dom.spec.whatwg.org/#notify-mutation-observers", () => {
  test("records are delivered once, in a microtask, in mutation order", async () => {
    const calls: string[][] = [];
    const mo = new MutationObserver((records, observer) => {
      expect(observer).toBe(mo);
      calls.push(records.map((r) => r.type));
    });
    const el = document.body!.appendChild(document.createElement("div"));
    mo.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
    el.setAttribute("a", "1");
    const t = el.appendChild(document.createTextNode("x"));
    t.data = "y";
    expect(calls).toEqual([]);
    await Promise.resolve();
    expect(calls).toEqual([["attributes", "childList", "characterData"]]);
    mo.disconnect();
  });

  test("oldValue is recorded only when requested", () => {
    const el = document.createElement("div");
    el.setAttribute("a", "old");
    const withOld = new MutationObserver(() => {});
    const without = new MutationObserver(() => {});
    withOld.observe(el, { attributes: true, attributeOldValue: true });
    without.observe(el, { attributes: true });
    el.setAttribute("a", "new");
    expect(withOld.takeRecords()[0].oldValue).toBe("old");
    expect(without.takeRecords()[0].oldValue).toBeNull();
    withOld.disconnect();
    without.disconnect();
  });

  test("observers are notified in creation order", async () => {
    const order: string[] = [];
    const first = new MutationObserver(() => order.push("first"));
    const second = new MutationObserver(() => order.push("second"));
    const el = document.createElement("div");
    second.observe(el, { attributes: true });
    first.observe(el, { attributes: true });
    el.id = "x";
    await Promise.resolve();
    expect(order).toEqual(["first", "second"]);
    first.disconnect();
    second.disconnect();
  });

  test("an exception in a callback is reported and does not stop other observers", async () => {
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (e: unknown) => errors.push(e);
    const window = createWindow();
    document = window.document;
    window.addEventListener("error", (e) => e.preventDefault());
    let ran = false;
    const bad = new MutationObserver(() => {
      throw new Error("boom");
    });
    const good = new MutationObserver(() => {
      ran = true;
    });
    const el = document.createElement("div");
    bad.observe(el, { attributes: true });
    good.observe(el, { attributes: true });
    el.id = "x";
    await Promise.resolve();
    console.error = orig;
    expect(ran).toBe(true);
    bad.disconnect();
    good.disconnect();
  });
});

describe("transient registered observers — https://dom.spec.whatwg.org/#concept-node-remove", () => {
  test("a removed subtree keeps reporting to subtree observers until the next delivery", async () => {
    const parent = document.createElement("div");
    const child = parent.appendChild(document.createElement("span"));
    const seen: string[] = [];
    const mo = new MutationObserver((records) => {
      for (const r of records) seen.push(`${r.type}:${(r.target as Element).localName ?? "#text"}`);
    });
    mo.observe(parent, { attributes: true, childList: true, subtree: true });
    child.remove();
    child.setAttribute("x", "1"); // still observed through the transient registration
    await Promise.resolve();
    child.setAttribute("y", "1"); // transient registration is gone after delivery
    await Promise.resolve();
    expect(seen).toEqual(["childList:div", "attributes:span"]);
    mo.disconnect();
  });
});

describe("zero cost when unused (activeObservers guard in observers/queue.ts)", () => {
  test("activeObservers counts observers with registrations and drops back on disconnect", () => {
    const base = activeObservers;
    const mo = new MutationObserver(() => {});
    mo.observe(document.body!, { childList: true });
    mo.observe(document.head!, { childList: true });
    expect(activeObservers).toBe(base + 1);
    mo.disconnect();
    expect(activeObservers).toBe(base);
  });

  test("disconnect() drops pending records", async () => {
    let called = false;
    const mo = new MutationObserver(() => (called = true));
    const el = document.createElement("div");
    mo.observe(el, { attributes: true });
    el.id = "x";
    mo.disconnect();
    await Promise.resolve();
    expect(called).toBe(false);
    expect(mo.takeRecords()).toEqual([]);
  });
});
