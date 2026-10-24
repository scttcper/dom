// (f2) expected to FAIL: `ctrl-dom debug` on a Jest project with `preset: "@ctrl/dom"`
// (jest.debug.config.cjs): jest-environment-ctrl-dom appends the failure snapshot.
"use strict";
const { render, screen } = require("@testing-library/react");
const { Signup, h } = require("./app.cjs");

test("signs up", () => {
  render(h(Signup));
  expect(screen.getByRole("button", { name: "Sign up" })).toBeEnabled();
});
