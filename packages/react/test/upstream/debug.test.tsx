// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/debug.js
// The inline snapshot uses vitest's array formatting, which matches jest's here.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@rtd/react";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  (console.log as any).mockRestore();
});

test("debug pretty prints the container", () => {
  const HelloWorld = () => <h1>Hello World</h1>;
  const { debug } = render(<HelloWorld />);
  debug();
  expect(console.log).toHaveBeenCalledTimes(1);
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Hello World"));
});

test("debug pretty prints multiple containers", () => {
  const HelloWorld = () => (
    <>
      <h1 data-testid="testId">Hello World</h1>
      <h1 data-testid="testId">Hello World</h1>
    </>
  );
  const { debug } = render(<HelloWorld />);
  const multipleElements = screen.getAllByTestId("testId");
  debug(multipleElements);

  expect(console.log).toHaveBeenCalledTimes(2);
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Hello World"));
});

test("allows same arguments as prettyDOM", () => {
  const HelloWorld = () => <h1>Hello World</h1>;
  const { debug, container } = render(<HelloWorld />);
  debug(container, 6, { highlight: false });
  expect(console.log).toHaveBeenCalledTimes(1);
  expect((console.log as any).mock.calls[0]).toMatchInlineSnapshot(`
    [
      "<div>
    ...",
    ]
  `);
});
