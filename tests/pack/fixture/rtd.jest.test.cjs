// (d2) `preset: "jest-environment-rtd"` with @rtd/react, @rtd/user-event and @rtd/jest-dom
// required from a CommonJS test file (their CJS builds), sharing the environment's @rtd/dom.
"use strict";
const { render, screen } = require("@rtd/react");
const userEvent = require("@rtd/user-event").default;
const dom = require("@rtd/dom");
const { Signup, h } = require("./app.cjs");

test("loads the CommonJS bundles", () => {
  expect(require.resolve("@rtd/react")).toMatch(/[\\/]@rtd[\\/]react[\\/]dist[\\/]index\.cjs$/);
  expect(require.resolve("@rtd/user-event")).toMatch(/[\\/]dist[\\/]index\.cjs$/);
});

test("one @rtd/dom: the test's require is the environment's instance", () => {
  expect(document.body).toBeInstanceOf(dom.HTMLElement);
  expect(globalThis.HTMLElement).toBe(dom.HTMLElement);
});

test("render, type, click, assert", async () => {
  const user = userEvent.setup();
  render(h(Signup));
  const button = screen.getByRole("button", { name: "Sign up" });
  expect(button).toBeDisabled();
  await user.type(screen.getByLabelText("Name"), "Ada");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
  await user.click(screen.getByRole("checkbox", { name: "Subscribe" }));
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(button);
  expect(await screen.findByRole("status")).toHaveTextContent("Welcome, Ada!");
  expect(screen.getByRole("status")).toBeInTheDocument();
});
