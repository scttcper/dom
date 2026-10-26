/**
 * Virtual clock with idle time skipping (packages/dom/src/window/clock.ts).
 *
 * Specs:
 *   HTML Standard — Timers: https://html.spec.whatwg.org/#timers (timer initialisation steps,
 *     https://html.spec.whatwg.org/#timer-initialisation-steps; ordering by due time then
 *     creation, "run steps after a timeout": https://html.spec.whatwg.org/#run-steps-after-a-timeout)
 *   Node.js — class Timeout (ref/unref/hasRef/refresh/close/Symbol.toPrimitive):
 *     https://nodejs.org/api/timers.html#class-timeout
 *   High Resolution Time — performance.now(): https://w3c.github.io/hr-time/#dom-performance-now
 *
 * The clock is installed on a scratch object standing in for a test file's global, so the
 * Vitest worker's own timers are never replaced.
 */
import { afterEach, describe, expect, test } from "vitest";
import { VirtualClock, installClock, type InstalledClock } from "@ctrl/dom/internal";
import { queueUserAgentTask } from "../../src/window/clock.ts";

type G = {
  setTimeout: (
    cb: (...a: unknown[]) => void,
    ms?: number,
    ...args: unknown[]
  ) => { hasRef(): boolean; ref(): unknown; unref(): unknown; refresh(): unknown };
  setInterval: (cb: (...a: unknown[]) => void, ms?: number) => unknown;
  clearTimeout: (h: unknown) => void;
  clearInterval: (h: unknown) => void;
  Date: DateConstructor;
  performance: Performance;
};

let installed: InstalledClock | null = null;

function setup(skip: boolean): G {
  const global = { Date, performance } as unknown as G & Record<PropertyKey, unknown>;
  installed = installClock(new VirtualClock({ skip }), global as unknown as Record<PropertyKey, unknown>);
  return global;
}

afterEach(() => {
  installed?.uninstall();
  installed = null;
});

const sleep = (g: G, ms: number) => new Promise<void>((resolve) => g.setTimeout(() => resolve(), ms));

describe("real-time mode (timeSkip: false) — https://html.spec.whatwg.org/#timers", () => {
  test("timers fire in due order, then creation order, at real time", async () => {
    const g = setup(false);
    const order: string[] = [];
    g.setTimeout(() => order.push("b20"), 20);
    g.setTimeout(() => order.push("a5"), 5);
    g.setTimeout(() => order.push("c5"), 5);
    const start = performance.now();
    await sleep(g, 30);
    expect(order).toEqual(["a5", "c5", "b20"]);
    expect(performance.now() - start).toBeGreaterThanOrEqual(25);
  });

  test("clearTimeout by handle or numeric id; intervals repeat until cleared", async () => {
    const g = setup(false);
    const fired: string[] = [];
    const a = g.setTimeout(() => fired.push("a"), 1);
    const b = g.setTimeout(() => fired.push("b"), 1);
    g.clearTimeout(a);
    g.clearTimeout(Number(b));
    let n = 0;
    const i = g.setInterval(() => {
      if (++n === 3) g.clearInterval(i);
    }, 2);
    await sleep(g, 30);
    expect(fired).toEqual([]);
    expect(n).toBe(3);
  });

  test("Timeout handle API: hasRef/unref/ref/refresh; arguments are passed through", async () => {
    const g = setup(false);
    const h = g.setTimeout(() => {}, 5);
    expect(h.hasRef()).toBe(true);
    h.unref();
    expect(h.hasRef()).toBe(false);
    h.ref();
    expect(h.hasRef()).toBe(true);
    g.clearTimeout(h);
    const got = await new Promise((resolve) => g.setTimeout((x: unknown, y: unknown) => resolve([x, y]), 1, "x", "y"));
    expect(got).toEqual(["x", "y"]);
  });

  test("Date and performance are not replaced", () => {
    const g = setup(false);
    expect(g.Date).toBe(Date);
    expect(g.performance).toBe(performance);
  });
});

describe("timer initialisation steps, the timeout — https://html.spec.whatwg.org/#timer-initialisation-steps", () => {
  test("a timeout below 1 ms (0, negative, NaN, fractional) waits 1 ms, as jsdom's Node timers do: a 0 ms timer created after a 1 ms one fires after it", async () => {
    const g = setup(true);
    const order: string[] = [];
    g.setTimeout(() => order.push("1ms"), 1);
    g.setTimeout(() => order.push("0ms"), 0);
    g.setTimeout(() => order.push("negative"), -5);
    g.setTimeout(() => order.push("NaN"), Number.NaN);
    g.setTimeout(() => order.push("fraction"), 0.9);
    g.setTimeout(() => order.push("2ms"), 2);
    await sleep(g, 10);
    expect(order).toEqual(["1ms", "0ms", "negative", "NaN", "fraction", "2ms"]);
  });

  test("the timeout is converted to a WebIDL long (https://webidl.spec.whatwg.org/#es-long): 2^31 wraps to a negative timeout, which waits 1 ms", async () => {
    const g = setup(true);
    const order: string[] = [];
    g.setTimeout(() => order.push("2ms"), 2);
    g.setTimeout(() => order.push("wrapped"), 2 ** 31);
    g.setTimeout(() => order.push("1.9ms"), 1.9);
    await sleep(g, 10);
    expect(order).toEqual(["wrapped", "1.9ms", "2ms"]);
  });
});

describe("idle time skipping (timeSkip: true)", () => {
  test("every setTimeout(0) hop advances time by 1 ms, as on Node: a 16 ms animation frame runs within 16 chained hops", async () => {
    // user-event waits with setTimeout(0) between actions; React Aria restores focus in an
    // animation frame after a menu closes. Without the minimum, hops would cost no virtual time
    // and the frame would run only after 16 ms of real time, many actions later.
    const g = setup(true);
    const start = g.performance.now();
    let elapsed = -1;
    g.setTimeout(() => (elapsed = g.performance.now() - start), 16);
    let hops = 0;
    while (elapsed === -1) {
      await sleep(g, 0);
      hops++;
    }
    // At most 16: real time passing between hops also moves the clock.
    expect(hops).toBeLessThanOrEqual(16);
    // Never early: a timer run by the continuation right after another one still sees its full delay.
    expect(elapsed).toBeGreaterThanOrEqual(16);
  });

  test("a long timer resolves without waiting; Date and performance advance by the skipped time", async () => {
    const g = setup(true);
    const realStart = performance.now();
    const dateStart = g.Date.now();
    const perfStart = g.performance.now();
    await sleep(g, 10_000);
    expect(performance.now() - realStart).toBeLessThan(500);
    expect(g.Date.now() - dateStart).toBeGreaterThanOrEqual(10_000);
    expect(g.performance.now() - perfStart).toBeGreaterThanOrEqual(10_000);
    expect(new g.Date().getTime()).toBeGreaterThanOrEqual(dateStart + 10_000);
    expect(new g.Date() instanceof Date).toBe(true);
    expect(typeof (g.Date as unknown as () => string)()).toBe("string");
  });

  test("skipIdle(ms) lets idle time pass at once, but not past a timer that falls due in it (user-event's waits between actions)", () => {
    const g = setup(true);
    const clock = installed!.clock;
    const start = g.performance.now();
    expect(clock.skipIdle(1)).toBe(true);
    expect(g.performance.now() - start).toBeGreaterThanOrEqual(1);
    g.setTimeout(() => {}, 3);
    expect(clock.skipIdle(1)).toBe(true);
    expect(clock.skipIdle(5)).toBe(false);
  });

  test("only the earliest timer is skipped to: awaiting 50 ms resumes before a 300 ms debounce fires", async () => {
    const g = setup(true);
    const fired: string[] = [];
    g.setTimeout(() => fired.push("debounce"), 300);
    await sleep(g, 50);
    expect(fired).toEqual([]);
    await sleep(g, 300);
    expect(fired).toEqual(["debounce"]);
  });

  test("pending immediates (React's scheduler in Node) run before time is skipped", async () => {
    const g = setup(true);
    const order: string[] = [];
    let chain = 0;
    const step = () => {
      order.push(`immediate${chain}`);
      if (++chain < 5) setImmediate(step);
    };
    setImmediate(step);
    g.setTimeout(() => order.push("timer"), 1_000);
    await sleep(g, 2_000);
    expect(order).toEqual(["immediate0", "immediate1", "immediate2", "immediate3", "immediate4", "timer"]);
  });

  test("a user agent task (selectionchange) runs before a 0 ms timer set after it, also when that timer would run as a continuation of one due with it (https://html.spec.whatwg.org/#queue-a-task)", async () => {
    const g = setup(true);
    const order: string[] = [];
    await new Promise<void>((resolve) => {
      // Two timers due together: the second runs right after the first, which queues the task.
      g.setTimeout(() => {
        queueUserAgentTask(() => order.push("task"));
        g.setTimeout(() => {
          order.push("timer");
          resolve();
        }, 0);
      }, 50);
      g.setTimeout(() => order.push("sibling"), 50);
    });
    expect(order).toEqual(["sibling", "task", "timer"]);
  });

  test("microtasks drain between timers that become due together", async () => {
    const g = setup(true);
    const order: string[] = [];
    g.setTimeout(() => {
      order.push("t1");
      queueMicrotask(() => order.push("micro"));
    }, 100);
    g.setTimeout(() => order.push("t2"), 100);
    await sleep(g, 200);
    expect(order).toEqual(["t1", "micro", "t2"]);
  });

  test("intervals keep their period in virtual time", async () => {
    const g = setup(true);
    const times: number[] = [];
    const start = g.performance.now();
    const i = g.setInterval(() => {
      times.push(Math.round(g.performance.now() - start));
      if (times.length === 4) g.clearInterval(i);
    }, 250);
    await sleep(g, 2_000);
    expect(times.length).toBe(4);
    for (let k = 0; k < 4; k++) expect(times[k]).toBeGreaterThanOrEqual(250 * (k + 1));
  });

  test("unref'd timers (RPC/request timeouts) stay on real time: skipping past their due time never fires them", async () => {
    const g = setup(true);
    const fired: string[] = [];
    g.setTimeout(() => fired.push("rpc-timeout"), 1_000).unref();
    await sleep(g, 60_000);
    expect(fired).toEqual([]);
    const h = g.setTimeout(() => fired.push("unref-short"), 5);
    h.unref();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fired).toEqual(["unref-short"]);
  });

  test("uninstall restores the global and drops pending timers", async () => {
    const global = { Date, performance, setTimeout: globalThis.setTimeout } as unknown as Record<PropertyKey, unknown>;
    const inst = installClock(new VirtualClock({ skip: true }), global);
    let fired = false;
    (global.setTimeout as G["setTimeout"])(() => (fired = true), 5);
    inst.uninstall();
    expect(global.setTimeout).toBe(globalThis.setTimeout);
    expect(global.Date).toBe(Date);
    await new Promise((r) => setTimeout(r, 20));
    expect(fired).toBe(false);
  });
});
