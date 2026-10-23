/**
 * Fixture (expected to FAIL): an exception thrown by a React onClick and not handled by any
 * "error" listener must fail the test, like under jest-environment-jsdom.
 * https://html.spec.whatwg.org/#report-an-exception
 * Run by test/jest.test.ts, which asserts the failure.
 */
"use strict";
const React = require("react");
const { render, fireEvent } = require("@testing-library/react");

test("throwing onClick", () => {
  const { container } = render(
    React.createElement("button", {
      onClick: () => {
        throw new Error("boom from onClick");
      },
    }, "x"),
  );
  fireEvent.click(container.querySelector("button"));
});
