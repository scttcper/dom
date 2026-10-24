// (u) bun test, bunfig.toml `[test] preload = ["@ctrl/dom/register"]`: React + @ctrl/dom/react +
// /user-event with @ctrl/dom/jest-dom/matchers on bun's expect.
import { expect, test } from "bun:test";
import * as matchers from "@ctrl/dom/jest-dom/matchers";
import * as dom from "@ctrl/dom";
import { render, screen } from "@ctrl/dom/react";
import userEvent from "@ctrl/dom/user-event";
import { Signup } from "./app.tsx";

expect.extend(matchers as never);

test("one @ctrl/dom: the globals are the registered window's", () => {
  expect(document.body).toBeInstanceOf(dom.HTMLElement);
  expect(document).toBeInstanceOf(dom.Document);
  expect(globalThis.HTMLElement).toBe(dom.HTMLElement);
});

test("render, type, click, assert", async () => {
  const user = userEvent.setup();
  render(<Signup />);
  const button = screen.getByRole("button", { name: "Sign up" });
  expect(button).toBeDisabled();
  await user.type(screen.getByLabelText("Name"), "Ada");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
  await user.click(screen.getByRole("checkbox", { name: "Subscribe" }));
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(button);
  expect(await screen.findByRole("status")).toHaveTextContent("Welcome, Ada!");
});

test("Testing Library's auto cleanup ran after the previous test", () => {
  expect(document.body).toBeEmptyDOMElement();
});
