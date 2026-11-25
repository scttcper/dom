/**
 * Differential test: @ctrl/dom/testing-library's event map vs stock @testing-library/dom@10.4.2's
 * dist/event-map.js. src/event-map.ts expands a compact run encoding at load, so the expanded
 * table is compared with upstream's exactly: entry order, EventType, every defaultInit member
 * and its order, and the alias map. fireEvent.<name> / createEvent.<name> are built from it.
 *
 * Spec of record: the stock library's table
 * (https://github.com/testing-library/dom-testing-library/blob/v10.4.2/src/event-map.js).
 */

import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { eventAliasMap, eventMap } from "../../src/event-map.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const require = createRequire(import.meta.url);
const stock: { eventMap: Record<string, any>; eventAliasMap: Record<string, string> } = require(
  require.resolve("@testing-library/dom/package.json").replace(/package\.json$/, "dist/event-map.js"),
);

describe("differential: event map — https://github.com/testing-library/dom-testing-library/blob/v10.4.2/src/event-map.js", () => {
  test("eventMap entries equal stock 10.4.2's, in order, with defaultInit members in order", () => {
    const entries = (map: Record<string, any>): [string, string][] =>
      Object.entries(map).map(([name, entry]) => [name, JSON.stringify(entry)]);
    expect(entries(eventMap)).toEqual(entries(stock.eventMap));
  });

  test("eventAliasMap equals stock 10.4.2's", () => {
    expect(Object.entries(eventAliasMap)).toEqual(Object.entries(stock.eventAliasMap));
  });

  test("every event has its own entry and defaultInit object (a mutation stays in its event)", () => {
    const entries = Object.values(eventMap);
    expect(new Set(entries).size).toBe(entries.length);
    expect(new Set(entries.map((e) => e.defaultInit)).size).toBe(entries.length);
  });
});
