/**
 * Integration: idioms from suites written against jest-environment-jsdom (Sentry's frontend
 * suite) under a real Jest 30 run on @ctrl/dom-jest-environment.
 *
 * Specs / reference behavior:
 *   Fetch Standard — https://fetch.spec.whatwg.org/#fetch-method (absent under jsdom)
 *   Clipboard API — https://w3c.github.io/clipboard-apis/#navigator-interface (absent under jsdom)
 *   HTML Standard — https://html.spec.whatwg.org/#dom-navigator-platform (jsdom: "")
 *   HTML Standard — Timers https://html.spec.whatwg.org/#timers
 *   HTML Standard — animation frames https://html.spec.whatwg.org/#run-the-animation-frame-callbacks
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

test('Object.assign(navigator, {clipboard}) works and navigator.platform is ""', async () => {
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

test("an iframe's requestAnimationFrame bound to the global works (rrweb getImplementation)", async () => {
  const sandbox = document.createElement("iframe");
  document.head.appendChild(sandbox);
  const impl = sandbox.contentWindow.requestAnimationFrame;
  document.head.removeChild(sandbox);
  const time = await new Promise((resolve) => impl.bind(window)(resolve));
  expect(typeof time).toBe("number");
});

test("a frame requested through a requestAnimationFrame captured before jest.useFakeTimers() still runs after jest.useRealTimers() (framer-motion's frame loop; jsdom's frames run on its own timers)", async () => {
  const requestFrame = window.requestAnimationFrame;
  jest.useFakeTimers();
  const frame = new Promise((resolve) => requestFrame(resolve));
  jest.useRealTimers();
  const lost = new Promise((_, reject) => setTimeout(() => reject(new Error("the frame was lost")), 1000));
  expect(typeof (await Promise.race([frame, lost]))).toBe("number");
});
