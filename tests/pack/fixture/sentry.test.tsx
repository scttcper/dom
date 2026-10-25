// (s1) @ctrl/dom/sentry under `ctrlDom({ sentry: true })`: a passing, a failing and a flaky test.
// sentry.check.mjs runs this file against a fake Sentry server and checks what arrives.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Signup } from "./app.tsx";

test("signs up", async () => {
  const user = userEvent.setup();
  render(<Signup />);
  await user.type(screen.getByLabelText("Name"), "Ada");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  expect(await screen.findByRole("status")).toBeTruthy();
});

test("greets before signing up", () => {
  render(<Signup />);
  // Fails on purpose: nothing has a status role before the form is submitted.
  screen.getByRole("status");
});

let attempts = 0;
test("passes on the retry", { retry: 1 }, () => {
  render(<Signup />);
  attempts++;
  if (attempts === 1) throw new Error("first attempt fails");
});
