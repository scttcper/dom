// (f1) expected to FAIL: `ctrl-dom debug` on a Vitest project with the ctrlDom() plugin
// (vitest.debug.config.ts). The stock Testing Library imports are routed to @ctrl/dom, whose
// cleanup runs before onTestFailed: the report must still show the rendered form.
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Signup } from "./app.tsx";

test("signs up", () => {
  render(<Signup />);
  expect(screen.getByRole("button", { name: "Sign up" })).toBeEnabled();
});
