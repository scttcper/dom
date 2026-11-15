/**
 * `within(el)` / `getQueriesForElement(el)` with the default queries builds its object from a
 * literal (src/get-queries-for-element.ts `bindDefaultQueries`). It must be what upstream's
 * reduce builds: a fresh object, upstream's keys in upstream's order, a fresh function bound to
 * the element for each, and it must follow changes to the exported `queries` object.
 *
 * Upstream: https://github.com/testing-library/dom-testing-library/blob/main/src/get-queries-for-element.js
 */
import { afterEach, describe, expect, test } from "vitest";
import * as stock from "@testing-library/dom";
import { getQueriesForElement, queries, within } from "../../src/index.ts";

declare const document: any;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("within() — https://github.com/testing-library/dom-testing-library/blob/main/src/get-queries-for-element.js", () => {
  test("has stock Testing Library's keys in its order, and bound functions like its", () => {
    const el = document.createElement("div");
    const ours = within(el);
    const theirs = stock.within(el as never) as Record<string, (...args: unknown[]) => unknown>;
    expect(Object.keys(ours)).toEqual(Object.keys(theirs));
    for (const key of Object.keys(ours)) {
      const fn = (ours as Record<string, (...args: unknown[]) => unknown>)[key]!;
      expect([key, fn.name, fn.length]).toEqual([key, theirs[key]!.name, theirs[key]!.length]);
      expect(Object.getOwnPropertyDescriptor(ours, key)).toMatchObject({
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  });

  test("returns a fresh object and fresh functions on each call, bound to the element", () => {
    document.body.innerHTML = `<p>a</p><section><p>b</p></section>`;
    const section = document.querySelector("section");
    const first = within(section);
    const second = within(section);
    expect(first).not.toBe(second);
    expect(first.getByText).not.toBe(second.getByText);
    expect(first.getByText("b")).toBe(section.firstChild);
    expect(first.queryByText("a")).toBeNull();
  });

  test("follows the exported queries object: a replaced function, and an added or removed key", () => {
    const el = document.createElement("div");
    const q = queries as Record<string, any>;
    const original = q.getByText;
    try {
      q.getByText = (container: unknown, text: string) => ["mock", container, text];
      expect(within(el).getByText("x")).toEqual(["mock", el, "x"]);
    } finally {
      q.getByText = original;
    }
    try {
      q.getByCustom = (container: unknown) => container;
      expect(Object.keys(within(el)).at(-1)).toBe("getByCustom");
      expect(within(el).getByCustom()).toBe(el);
    } finally {
      delete q.getByCustom;
    }
    const keys = Object.keys(within(el));
    expect(keys).toEqual(Object.keys(queries));
  });

  test("custom queries and an initial value still go through upstream's reduce", () => {
    const el = document.createElement("div");
    const initial = { existing: 1 } as Record<string, unknown>;
    const out = getQueriesForElement(el, { getByCustom: (c: unknown) => c }, initial as never);
    expect(out).toBe(initial);
    expect(Object.keys(out)).toEqual(["existing", "getByCustom"]);
    expect(out.getByCustom()).toBe(el);
  });
});
