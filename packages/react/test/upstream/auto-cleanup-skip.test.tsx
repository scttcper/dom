// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/auto-cleanup-skip.js
// `require('../')` -> dynamic `import("@ctrl/dom/react")` (ESM); same assertions.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";

// No lib.dom in this repo: environment globals are untyped here.
declare const document: any;
declare const window: any;
declare const Event: any;

let render: typeof import("@ctrl/dom/react").render;
beforeAll(async () => {
  process.env.RTL_SKIP_AUTO_CLEANUP = "true";
  const rtl = await import("@ctrl/dom/react");
  render = rtl.render;
});

// Not upstream: vitest reuses worker processes, so restore the env for later files.
afterAll(() => {
  delete process.env.RTL_SKIP_AUTO_CLEANUP;
});

// This one verifies that if RTL_SKIP_AUTO_CLEANUP is set
// then we DON'T auto-wire up the afterEach for folks
test("first", () => {
  render(<div>hi</div>);
});

test("second", () => {
  expect(document.body.innerHTML).toEqual("<div><div>hi</div></div>");
});
