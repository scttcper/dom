// Run by test/register.test.ts as plain `node --test` (no preload): the import registers.
import "@rtd/register";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { render, screen } from "@rtd/react";
import { Signup } from "../signup.ts";

test("renders after a per-file import", () => {
  render(createElement(Signup));
  assert.equal(screen.getAllByRole("button").length, 1);
});

test("cleanup ran between tests", () => {
  assert.equal(document.body.childNodes.length, 0);
  render(createElement(Signup));
  assert.equal(screen.getAllByRole("button").length, 1);
});
