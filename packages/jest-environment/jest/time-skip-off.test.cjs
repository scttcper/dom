/**
 * @jest-environment-options {"timeSkip": false}
 *
 * Integration: with timeSkip off, timers are real time and waitFor polls in real time.
 * Spec: HTML Standard — Timers https://html.spec.whatwg.org/#timers
 */
"use strict";
const { screen } = require("@testing-library/dom");

const realNow = () => process.hrtime.bigint() / 1_000_000n;

test("findBy waits the full 300 ms of real time", async () => {
  const start = realNow();
  setTimeout(() => {
    document.body.innerHTML = "<p>loaded</p>";
  }, 300);
  expect(await screen.findByText("loaded")).toBeTruthy();
  expect(Number(realNow() - start)).toBeGreaterThanOrEqual(280);
});
