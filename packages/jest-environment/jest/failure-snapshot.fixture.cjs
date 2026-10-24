/**
 * Fixture (expected to FAIL): agent debug mode's failure snapshots. Run by test/jest.test.ts with
 * CTRL_DOM_DEBUG=aria, which asserts that each failing test's message ends with an aria snapshot
 * of document.body as it was when the test failed (before Testing Library's cleanup).
 */
"use strict";
const React = require("react");
const { render, screen } = require("@testing-library/react");

const h = React.createElement;

function Checkout() {
  return h(
    "main",
    null,
    h("h1", null, "Checkout"),
    h("form", { "aria-label": "Payment" }, h("input", { "aria-label": "Email" }), h("button", null, "Pay now")),
  );
}

test("a failed expect", () => {
  render(h(Checkout));
  expect(screen.getByRole("heading").textContent).toBe("Cart");
});

test("a thrown error", () => {
  render(h(Checkout));
  throw new Error("boom");
});

test("passes", () => {
  render(h(Checkout));
});
