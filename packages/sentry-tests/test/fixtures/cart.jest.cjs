// The Jest twin of cart.vitest.ts.
"use strict";
const { tracingChannel } = require("node:diagnostics_channel");

const spans = tracingChannel("sentry-tests:span");
const traced = (op, description, fn) => spans.traceSync(fn, { op, description, data: { rows: 1 }, async: false });

jest.retryTimes(1);

describe("Cart", () => {
  let items;
  beforeEach(() => {
    items = ["Apple"];
  });
  afterEach(() => {
    items = [];
  });

  test("adds an item", () => {
    traced("db.query", "SELECT * FROM items", () => {});
    expect(items).toHaveLength(1);
  });

  test("checks out", () => {
    expect(items[0]).toBe("Pear");
  });
});

let attempts = 0;
test("eventually passes", () => {
  attempts++;
  if (attempts === 1) throw new Error("first try");
});
