/**
 * Integration: idle time skipping (testEnvironmentOptions.timeSkip, default on) under a real
 * Jest 30 run, with stock @testing-library/dom's findBy/waitFor (real-timers branch: 50 ms
 * interval, 1 s timeout, MutationObserver).
 *
 * Specs: HTML Standard — Timers https://html.spec.whatwg.org/#timers;
 *   High Resolution Time https://w3c.github.io/hr-time/#dom-performance-now
 */
"use strict";
const { screen, waitFor } = require("@testing-library/dom");

const realNow = () => process.hrtime.bigint() / 1_000_000n;

afterEach(() => {
  document.body.innerHTML = "";
  jest.useRealTimers();
});

test("findBy waits for a 300 ms app timer without spending 300 ms; Date advances with it", async () => {
  const start = realNow();
  const dateStart = Date.now();
  setTimeout(() => {
    document.body.innerHTML = "<p>loaded</p>";
  }, 300);
  expect(await screen.findByText("loaded")).toBeTruthy();
  expect(Number(realNow() - start)).toBeLessThan(150);
  expect(Date.now() - dateStart).toBeGreaterThanOrEqual(300);
});

test("a findBy that never matches times out after 1 s of virtual time, not wall time", async () => {
  const start = realNow();
  await expect(screen.findByText("never")).rejects.toThrow(/Unable to find an element with the text: never/);
  expect(Number(realNow() - start)).toBeLessThan(500);
});

test("a debounce longer than the awaited timer does not fire early", async () => {
  const fired = [];
  setTimeout(() => fired.push("debounce"), 300);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(fired).toEqual([]);
  await waitFor(() => expect(fired).toEqual(["debounce"]));
});

test("jest fake timers still take over and hand the virtual clock back", () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  setTimeout(fn, 1000);
  jest.advanceTimersByTime(1000);
  expect(fn).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
  expect(typeof setTimeout).toBe("function");
  expect(Object.hasOwn(setTimeout, "clock")).toBe(false);
});
