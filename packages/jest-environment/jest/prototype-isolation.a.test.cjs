/**
 * Interface prototypes are shared per worker (one @rtd/dom per worker); patches a test file makes
 * must not leak into the next file. Two identical files run in one worker (--runInBand): whichever
 * runs second must see pristine prototypes. https://webidl.spec.whatwg.org/#es-interfaces
 */
"use strict";
test("interface prototypes and statics are pristine in every test file", () => {
  expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "__rtdMarker")).toBeUndefined();
  expect(Element.prototype.hasPointerCapture).toBeUndefined();
  expect(Node.ELEMENT_NODE).toBe(1);
  // Typical setup-file / beforeAll patches that are never undone.
  Object.defineProperty(HTMLElement.prototype, "__rtdMarker", { value: 1, configurable: true });
  Element.prototype.hasPointerCapture ??= jest.fn(); // Sentry-style polyfill in a setup file
  jest.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(10);
  Node.ELEMENT_NODE_PATCHED = true;
});
