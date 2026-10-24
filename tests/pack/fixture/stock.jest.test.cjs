// (d1) `testEnvironment: "@ctrl/dom-jest-environment"` with stock Testing Library (CommonJS, no transform); (d2) the
// same file under `preset: "@ctrl/dom"`, which routes @testing-library/* to @ctrl/dom.
"use strict";
const { render, screen } = require("@testing-library/react");
const userEvent = require("@testing-library/user-event").default;
const { Signup, h } = require("./app.cjs");

test("render, type, click, assert", async () => {
  expect(document.body.constructor.name).toBe("HTMLBodyElement");
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
});
