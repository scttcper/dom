// A describe block with hooks, a passing, a failing and a flaky test, and a span of the test's own
// on the "sentry-tests:span" channel (runners.test.ts checks what reaches Sentry).
import { tracingChannel } from "node:diagnostics_channel";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

const spans = tracingChannel("sentry-tests:span");
const traced = <T>(op: string, description: string, fn: () => T): T =>
  spans.traceSync(fn, { op, description, data: { rows: 1 }, async: false });

describe("Cart", () => {
  beforeEach(() => {
    document.body.innerHTML = "<ul><li>Apple</li></ul><button>Checkout</button>";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("adds an item", () => {
    traced("db.query", "SELECT * FROM items", () => {});
    expect(document.querySelectorAll("li")).toHaveLength(1);
  });

  test("checks out", () => {
    expect(document.querySelector("button")?.textContent).toBe("Pay");
  });
});

// A failure outside any test: Vitest skips the block's tests and keeps the error on the block.
describe("Coupons", () => {
  beforeAll(() => {
    throw new Error("coupon service down");
  });
  test("applies a coupon", () => {});
});

test.skip("pays later", () => {});
test("constructor", () => {});

// A file-level hook: top-level tests run it, and so do the describe block's.
afterAll(() => {});
afterEach(() => {});

let attempts = 0;
test("eventually passes", { retry: 1 }, () => {
  attempts++;
  if (attempts === 1) throw new Error("first try");
});
