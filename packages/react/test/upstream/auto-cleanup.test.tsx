// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/auto-cleanup.js
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";
import { render } from "@rtd/react";

// No lib.dom in this repo: environment globals are untyped here.
declare const document: any;
declare const window: any;
declare const Event: any;

// This just verifies that by importing RTL in an
// environment which supports afterEach (like jest)
// we'll get automatic cleanup between tests.
test("first", () => {
  render(<div>hi</div>);
});

test("second", () => {
  expect(document.body).toBeEmptyDOMElement();
});
