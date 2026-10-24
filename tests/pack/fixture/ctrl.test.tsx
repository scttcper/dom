// @vitest-environment ctrl-dom
// (b) @ctrl/dom's Testing Library subpaths imported directly (also checked by `tsc --noEmit`, (e)).
import { render, screen } from "@ctrl/dom/react";
import userEvent from "@ctrl/dom/user-event";
import "@ctrl/dom/jest-dom/vitest";
import { expect, test } from "vitest";
import { Signup } from "./app.tsx";
import { expectSingleDom } from "./single-dom.ts";

test("render, type, click, assert", async () => {
  expectSingleDom();
  const user = userEvent.setup();
  render(<Signup />);
  const button = screen.getByRole("button", { name: "Sign up" });
  expect(button).toBeDisabled();
  expect(document.body).toMatchAriaSnapshot(`
    - textbox "Name"
    - checkbox "Subscribe"
    - button /Sign/ [disabled]
  `);
  await user.type(screen.getByLabelText("Name"), "Ada");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
  await user.click(screen.getByRole("checkbox", { name: "Subscribe" }));
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(button);
  expect(await screen.findByRole("status")).toHaveTextContent("Welcome, Ada!");
  expect(screen.getByRole("status")).toBeInTheDocument();
});
