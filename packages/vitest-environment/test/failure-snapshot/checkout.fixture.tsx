/**
 * Fixture (expected to FAIL): agent debug mode's failure snapshots under Vitest. Run by
 * test/failure-snapshot.test.ts with CTRL_DOM_DEBUG=aria, which asserts what each failing test's
 * message ends with. Stock @testing-library/react cleans up in its global afterEach, which runs
 * before onTestFailed: the snapshot must still show the rendered tree.
 */
import { expect, test } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ariaSnapshot, getByRole } from "@rtd/testing-library";

function Checkout() {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <h1>Checkout</h1>
      <form aria-label="Payment">
        <input aria-label="Email" />
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          Options
        </button>
        {open ? <button type="button">Gift wrap</button> : null}
      </form>
    </main>
  );
}

test("a failed expect", () => {
  render(<Checkout />);
  expect(screen.getByRole("heading").textContent).toBe("Cart");
});

test("a thrown error", () => {
  render(<Checkout />);
  throw new Error("boom");
});

test("what changed since the previous snapshot", () => {
  render(<Checkout />);
  ariaSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Options" }));
  expect(screen.queryByRole("button", { name: "Gift wrap" })).toBeNull();
});

test("a failed query that printed the snapshot already", () => {
  render(<Checkout />);
  getByRole(document.body, "button", { name: "Submit" });
});

test("passes", () => {
  render(<Checkout />);
  console.log("rendered the checkout");
});
