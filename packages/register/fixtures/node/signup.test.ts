// Run by test/register.test.ts as `node --import @ctrl/dom/register --test`: React + @ctrl/dom/react +
// user-event under node:test, asserting with node:assert and with jest-dom's matchers on the
// standalone `expect` package.
import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "expect";
import * as matchers from "@ctrl/dom/jest-dom/matchers";
import * as dom from "@ctrl/dom";
import { createElement } from "react";
import { render, screen } from "@ctrl/dom/react";
import userEvent from "@ctrl/dom/user-event";
import { Signup } from "../signup.ts";

expect.extend(matchers);

test("the window is the global and the bridged DOM instance", () => {
  assert.equal(globalThis.HTMLElement, dom.HTMLElement);
  assert.ok(document.body instanceof dom.HTMLElement);
  assert.equal(location.href, process.env.EXPECT_URL ?? "http://localhost:3000/");
});

test("render, type, submit (node:assert)", async () => {
  const user = userEvent.setup();
  render(createElement(Signup));
  const button = screen.getByRole("button", { name: "Sign up" }) as HTMLButtonElement;
  assert.equal(button.disabled, true);
  await user.type(screen.getByLabelText("Name"), "Ada");
  assert.equal((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value, "Ada");
  const start = Date.now();
  await user.click(button);
  assert.equal((await screen.findByRole("status")).textContent, "Welcome, Ada!");
  // The 500 ms submit delay passed on the virtual clock.
  assert.ok(Date.now() - start >= 500);
});

test("auto cleanup unmounted the previous test's render; jest-dom matchers via expect", async () => {
  expect(document.body).toBeEmptyDOMElement();
  const user = userEvent.setup();
  render(createElement(Signup));
  expect(screen.getByRole("button")).toBeDisabled();
  await user.type(screen.getByRole("textbox"), "Grace");
  expect(screen.getByRole("textbox")).toHaveValue("Grace");
  await user.click(screen.getByRole("button"));
  expect(await screen.findByRole("status")).toHaveTextContent("Welcome, Grace!");
});
