// Run by test/register.test.ts as `bun test` in this directory (bunfig.toml preloads @ctrl/dom/register).
import { expect, test } from "bun:test";
import * as matchers from "@ctrl/dom/jest-dom/matchers";
import * as dom from "@ctrl/dom";
import { render, screen } from "@ctrl/dom/react";
import userEvent from "@ctrl/dom/user-event";
import { Signup } from "../signup.ts";

expect.extend(matchers as never);

declare module "bun:test" {
  interface Matchers<T> {
    toBeDisabled(): T;
    toBeEmptyDOMElement(): T;
    toHaveValue(value: unknown): T;
    toHaveTextContent(text: string | RegExp): T;
  }
}

test("the window is the global and the bridged DOM instance", () => {
  expect(globalThis.HTMLElement).toBe(dom.HTMLElement);
  expect(document.body).toBeInstanceOf(dom.HTMLElement);
});

test("render, type, submit with jest-dom matchers", async () => {
  const user = userEvent.setup();
  render(<Signup />);
  expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
  await user.type(screen.getByLabelText("Name"), "Ada");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
  const start = Date.now();
  await user.click(screen.getByRole("button"));
  expect(await screen.findByRole("status")).toHaveTextContent("Welcome, Ada!");
  expect(Date.now() - start).toBeGreaterThanOrEqual(500);
});

test("auto cleanup unmounted the previous test's render", () => {
  expect(document.body).toBeEmptyDOMElement();
});
