// (a) stock Testing Library on vitest-environment-rtd; (c) the same file with
// `resolve.alias` from @testing-library/* to @rtd/* (vitest.alias.config.ts).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { expect, test } from "vitest";
import { Signup } from "./app.tsx";
import { expectSingleDom } from "./single-dom.ts";

test("render, type, click, assert", async () => {
  expectSingleDom();
  const user = userEvent.setup();
  render(<Signup />);
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
