/**
 * React components tested the way component suites test them: render with
 * @testing-library/react, query by role, act with user-event, clean up. Imports are the stock
 * packages; a contender may alias them to its own implementation (ctrl-dom-stack).
 *
 * Specs exercised:
 *   - accessible names for getByRole:  https://w3c.github.io/accname/#mapping_additional_nd_te
 *   - ARIA roles:                      https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings
 *   - UI events dispatched by user-event: https://w3c.github.io/uievents/
 *   - timers (findBy* waits):          https://html.spec.whatwg.org/#timers
 */
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Counter, DelayedGreeting, KeyedList, NameInput, OrdersTable, SignupForm } from "../fixtures/components.tsx";
import { measure } from "../lib/bench.ts";

describe("React + Testing Library", () => {
  test("render and query", async (ctx) => {
    await measure(ctx, "Render a 20-field form, 10 getByRole({ name }) queries", () => {
      render(<SignupForm />);
      for (let i = 0; i < 10; i++) screen.getByRole("textbox", { name: `Field ${i}` });
      cleanup();
    });
  });

  test("type", async (ctx) => {
    await measure(ctx, "user.type('hello world') into a controlled input", async () => {
      const user = userEvent.setup();
      render(<NameInput />);
      const input = screen.getByRole("textbox", { name: "Name" });
      await user.type(input, "hello world");
      expect(input).toHaveProperty("value", "hello world");
      cleanup();
    });
  });

  test("click", async (ctx) => {
    await measure(ctx, "user.click a button 10 times (state updates)", async () => {
      const user = userEvent.setup();
      render(<Counter />);
      const button = screen.getByRole("button");
      for (let i = 0; i < 10; i++) await user.click(button);
      expect(button.textContent).toBe("Clicked 10 times");
      cleanup();
    });
  });

  test("rerender", async (ctx) => {
    const items = Array.from({ length: 500 }, (_, i) => i);
    const reversed = items.toReversed();
    await measure(ctx, "Reverse a 500-row keyed list, then getAllByRole('listitem')", () => {
      const { rerender } = render(<KeyedList items={items} />);
      rerender(<KeyedList items={reversed} />);
      if (screen.getAllByRole("listitem").length !== 500) throw new Error("expected 500 rows");
      cleanup();
    });
  });

  test("text query", async (ctx) => {
    render(<OrdersTable rows={200} />);
    let i = 0;
    await measure(ctx, "getByText among 200 table rows", () => screen.getByText(`Order ${i++ % 200}`));
    cleanup();
  });

  test("findBy", async (ctx) => {
    await measure(ctx, "findByRole after a 20 ms timer", async () => {
      render(<DelayedGreeting delay={20} />);
      await screen.findByRole("status");
      cleanup();
    });
  });
});
