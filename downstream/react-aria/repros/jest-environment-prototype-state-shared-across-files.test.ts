/**
 * Downstream repro (React Aria: order-dependent failures that differ between runs and between
 * rtd-dom and rtd-full, e.g. 41 rtd-full failures in useLandmark.test.tsx "Property
 * `clientWidth` does not have access type get" — the file passes when run alone; another file in
 * the same worker had spied on HTMLElement.prototype.clientHeight and only mockReset() it).
 *
 * jest-environment-jsdom creates a new JSDOM — new interface objects and prototypes — for every
 * test file, so prototype patches die with the file. jest-environment-rtd loads @rtd/dom once per
 * worker (the singleton strategy) and createWindow() reuses the module's interface objects, so a
 * patch to HTMLElement.prototype (spies, polyfills, `Element.prototype.scrollIntoView = jest.fn()`)
 * leaks into every later test file of that worker. `run.ts --triage isolate` (recycle the worker
 * after each file) removes this source of flakiness.
 *
 * Owner: jest-environment (+ window: per-window interface objects, or snapshot/restore the
 * interface prototypes' own properties in teardown).
 */
import { describe, expect, test } from "vitest";
import { runJestFixture } from "./engines.ts";

describe.each(["jsdom", "rtd"] as const)("jest-environment-%s", (engine) => {
  test("a prototype patch made in one test file is not visible in the next file of the same worker", { timeout: 60_000 }, () => {
    const result = runJestFixture("prototype-leak.*.fixture.cjs", engine, ["--runInBand"]);
    if (result === null) return;
    expect(result.message).toBe("");
    expect(result.failures).toEqual([]);
  });
});
