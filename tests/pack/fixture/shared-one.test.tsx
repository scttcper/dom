// (cs) Under `sharedWorkers` both files run in one worker: each starts from an empty body, the
// start URL and fresh first-party modules, and leaves a mounted tree and a pushed URL behind.
import { types } from "node:util";
import * as jsxRuntime from "react/jsx-dev-runtime";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { load } from "./shared-state.ts";

test("starts clean and leaves a mess (one)", () => {
  expect(load()).toBe(1);
  expect(document.body.childNodes.length).toBe(0);
  expect(location.pathname).toBe("/");
  // The plugin's copy of React's JSX runtime, which Vitest does not wrap in a Proxy.
  expect(types.isProxy(jsxRuntime)).toBe(false);
  render(<button type="button">left by one</button>);
  expect(screen.getByRole("button", { name: "left by one" })).toBeDefined();
  history.pushState(null, "", "/one");
});
