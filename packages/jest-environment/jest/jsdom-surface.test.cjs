/**
 * Integration: idioms from suites written against jest-environment-jsdom (Sentry's frontend
 * suite) under a real Jest 30 run on @ctrl/dom-jest-environment.
 *
 * Specs / reference behavior:
 *   Fetch Standard — https://fetch.spec.whatwg.org/#fetch-method (absent under jsdom)
 *   Clipboard API — https://w3c.github.io/clipboard-apis/#navigator-interface (absent under jsdom)
 *   HTML Standard — https://html.spec.whatwg.org/#dom-navigator-platform (jsdom: "")
 *   HTML Standard — Timers https://html.spec.whatwg.org/#timers
 *   Web IDL — operations on the global https://webidl.spec.whatwg.org/#dfn-create-operation-function
 */
"use strict";

afterEach(() => {
  jest.useRealTimers();
});

test("fetch/Request/Response are absent, like jest-environment-jsdom (jest-fetch-mock then uses its polyfill)", () => {
  expect([typeof fetch, typeof Request, typeof Response]).toEqual(["undefined", "undefined", "undefined"]);
  expect(typeof Headers).toBe("function");
  expect(typeof FormData).toBe("function");
});

test("Object.assign(navigator, {clipboard}) works and navigator.platform is \"\"", async () => {
  const writeText = jest.fn();
  Object.assign(navigator, { clipboard: { writeText } });
  await navigator.clipboard.writeText("copied");
  expect(writeText).toHaveBeenCalledWith("copied");
  expect(navigator.platform).toBe("");
});

test("modern and legacy fake timers install and uninstall mid-file over the window-owned timers", () => {
  const realSetTimeout = setTimeout;
  jest.useFakeTimers();
  const spy = jest.fn();
  setTimeout(spy, 1000);
  jest.advanceTimersByTime(1000);
  expect(spy).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
  expect(setTimeout).toBe(realSetTimeout);
  jest.useFakeTimers({ legacyFakeTimers: true });
  setTimeout(spy, 1000);
  jest.runAllTimers();
  expect(spy).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
  expect(setTimeout).toBe(realSetTimeout);
  // Left pending on purpose: teardown's window.close() clears it.
  setTimeout(() => {
    throw new Error("timer outlived its test file");
  }, 300_000);
});

test("an iframe's requestAnimationFrame bound to the global works (rrweb getImplementation)", () => {
  jest.useFakeTimers();
  const sandbox = document.createElement("iframe");
  document.head.appendChild(sandbox);
  const impl = sandbox.contentWindow.requestAnimationFrame;
  document.head.removeChild(sandbox);
  const spy = jest.fn();
  impl.bind(window)(spy);
  jest.advanceTimersByTime(16);
  expect(spy).toHaveBeenCalledTimes(1);
});
