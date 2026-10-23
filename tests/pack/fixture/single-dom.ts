// Asserts the test sees the DOM instance the environment installed: the globals are instances of
// the classes exported by the one installed @ctrl/dom (a second copy would fail instanceof).
import * as dom from "@ctrl/dom";
import { expect } from "vitest";

export function expectSingleDom(): void {
  expect(document.body).toBeInstanceOf(dom.HTMLElement);
  expect(document).toBeInstanceOf(dom.Document);
  expect(globalThis.HTMLElement).toBe(dom.HTMLElement);
}
