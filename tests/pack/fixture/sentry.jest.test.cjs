// (s2) @ctrl/dom/sentry with Jest's reporter: a passing, a failing and a flaky test.
// sentry.check.mjs runs this file against a fake Sentry server and checks what arrives.
"use strict";
const { render, screen } = require("@testing-library/react");
const userEvent = require("@testing-library/user-event").default;
const { Signup, h } = require("./app.cjs");

jest.retryTimes(1);

test("signs up", async () => {
  const user = userEvent.setup();
  render(h(Signup));
  await user.type(screen.getByLabelText("Name"), "Ada");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  expect(await screen.findByRole("status")).toBeInTheDocument();
});

describe("Signup", () => {
  test("types a name", async () => {
    render(h(Signup));
    await userEvent.setup().type(screen.getByLabelText("Name"), "Grace");
  });
});

test("greets before signing up", () => {
  render(h(Signup));
  // Fails on purpose: nothing has a status role before the form is submitted.
  screen.getByRole("status");
});

let attempts = 0;
test("passes on the retry", () => {
  render(h(Signup));
  attempts++;
  if (attempts === 1) throw new Error("first attempt fails");
});
