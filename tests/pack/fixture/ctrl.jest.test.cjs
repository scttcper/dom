// (d3) `testEnvironment: "ctrl-dom"` with @ctrl/dom/react and @ctrl/dom/user-event required from
// a CommonJS test file (their CJS builds), sharing the environment's @ctrl/dom.
"use strict";
const { render, screen } = require("@ctrl/dom/react");
const userEvent = require("@ctrl/dom/user-event").default;
const dom = require("@ctrl/dom");
const { Signup, h } = require("./app.cjs");

test("loads the CommonJS bundles", () => {
  expect(require.resolve("@ctrl/dom/react")).toMatch(/[\\/]@ctrl[\\/]dom[\\/]dist[\\/]react[\\/]index\.cjs$/);
  expect(require.resolve("@ctrl/dom/user-event")).toMatch(/[\\/]dist[\\/]user-event[\\/]index\.cjs$/);
});

test("one @ctrl/dom: the test's require is the environment's instance", () => {
  expect(document.body).toBeInstanceOf(dom.HTMLElement);
  expect(globalThis.HTMLElement).toBe(dom.HTMLElement);
});

test("render, type, click, assert", async () => {
  const user = userEvent.setup();
  render(h(Signup));
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
