// (n) node:test, `node --import @ctrl/dom/register --test node.test.ts`: React + @ctrl/dom/react +
// /user-event, asserted with node:assert and with @ctrl/dom/jest-dom/matchers on the standalone
// `expect` package. Node strips the types but does not transform JSX, so the component is app.cjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "expect";
import * as matchers from "@ctrl/dom/jest-dom/matchers";
import * as dom from "@ctrl/dom";
import { render, screen } from "@ctrl/dom/react";
import userEvent from "@ctrl/dom/user-event";
import app from "./app.cjs";

expect.extend(matchers);

test("one @ctrl/dom: the globals are the registered window's", () => {
  assert.ok(document.body instanceof dom.HTMLElement);
  assert.ok(document instanceof dom.Document);
  assert.equal(globalThis.HTMLElement, dom.HTMLElement);
});

test("render, type, click, assert", async () => {
  const user = userEvent.setup();
  render(app.h(app.Signup));
  const button = screen.getByRole("button", { name: "Sign up" }) as HTMLButtonElement;
  assert.equal(button.disabled, true);
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
