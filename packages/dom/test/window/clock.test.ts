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
import {
  canSkipZeroDelayWait,
  foreignImmediatesPending,
  queueUserAgentTask,
  skipZeroDelayWait,
} from "../../src/window/clock.ts";

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

  test("I/O beyond what was active at install (a listening server) blocks skipping: a 50 ms timer waits for real, and skipping resumes once the server closes", async () => {
    const g = setup(true);
    const { createServer } = await import("node:net");
    const server = createServer().listen(0);
    let start = performance.now();
    try {
      await sleep(g, 50);
      expect(performance.now() - start).toBeGreaterThanOrEqual(40);
    } finally {
      server.close();
    }
    start = performance.now();
    await sleep(g, 10_000);
    expect(performance.now() - start).toBeLessThan(1_000);
  });

  test("busy(): a queued Immediate first; else I/O when a resource type outnumbers its count at creation (a new type, or one more of a type); Timeouts and unref'd handles never count", async () => {
    const { createServer, connect } = await import("node:net");
    await new Promise<void>((resolve) => setImmediate(resolve)); // earlier tests' queued immediates run
    const first = createServer().listen(0); // one TCPServerWrap in the baseline
    const second = createServer();
    let socket: ReturnType<typeof connect> | null = null;
    try {
      const clock = new VirtualClock({ skip: true });
      expect(clock.busy()).toBe(null);
      const timer = setTimeout(() => {}, 1_000);
      expect(clock.busy()).toBe(null);
      clearTimeout(timer);
      second.listen(0); // two TCPServerWraps
      expect(clock.busy()).toBe("io");
      second.unref();
      expect(clock.busy()).toBe(null);
      // A type the baseline lacks counts, though there are no more handles in all than at creation.
      first.unref();
      socket = connect({ port: (second.address() as { port: number }).port, host: "127.0.0.1" });
      expect(clock.busy()).toBe("io");
      // Node lists immediates after handles: the scan goes on past the I/O it found.
      const immediate = setImmediate(() => {});
      expect(clock.busy()).toBe("immediate");
      clearImmediate(immediate);
      socket.unref();
      expect(clock.busy()).toBe(null);
    } finally {
      socket?.destroy();
      first.close();
      second.close();
    }
  });

  test("foreignImmediatesPending counts queued immediates except the clock's own driver turn (user-event yields until React's continue)", async () => {
    const g = setup(true);
    g.setTimeout(() => {}, 1_000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    // The driver's next turn is queued, waiting for the loop to go idle: not someone else's work.
    expect(process.getActiveResourcesInfo()).toContain("Immediate");
    expect(foreignImmediatesPending()).toBe(false);
    const other = setImmediate(() => {});
    expect(foreignImmediatesPending()).toBe(true);
    clearImmediate(other);
    expect(foreignImmediatesPending()).toBe(false);
  });

  test("skipZeroDelayWait: on an idle loop the millisecond a 0 ms timer waits passes at once, so the caller yields one event-loop turn instead of the driver's two idle turns (Testing Library's asyncWrapper drain)", async () => {
    // Earlier tests' leftovers (an uninstalled clock's queued driver turn, a closing server) settle first.
    for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => setImmediate(resolve));
    const g = setup(true) as G & Record<PropertyKey, unknown>;
    g.setImmediate = setImmediate;
    const clock = installed!.clock;
    // The first look, from a microtask, lets no time pass.
    expect(canSkipZeroDelayWait(g)).toBe(true);
    expect(clock.skipped).toBe(0);
    expect(skipZeroDelayWait(g)).toBe(true);
    expect(clock.skipped).toBe(1);
    // With only the driver's own turn queued (a far timer is pending), the loop still counts as idle.
    g.setTimeout(() => {}, 1_000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(process.getActiveResourcesInfo()).toContain("Immediate");
    expect(skipZeroDelayWait(g)).toBe(true);
    expect(clock.skipped).toBe(2);
    // user-event's timer observer wraps setTimeout and copies its own properties: still the clock's.
    const original = g.setTimeout;
    const observer = function (this: unknown, ...args: Parameters<G["setTimeout"]>) {
      return original.apply(this, args);
    };
    Object.defineProperties(observer, Object.getOwnPropertyDescriptors(original));
    g.setTimeout = observer as G["setTimeout"];
    expect(skipZeroDelayWait(g)).toBe(true);
    expect(clock.skipped).toBe(3);
  });

  test("skipZeroDelayWait: false, letting no time pass, when a timer falls due within the millisecond, someone else's immediate is queued, or setTimeout/setImmediate are not the clock's and Node's (fake timers, spies)", () => {
    const g = setup(true) as G & Record<PropertyKey, unknown>;
    g.setImmediate = setImmediate;
    const clock = installed!.clock;
    const due = g.setTimeout(() => {}, 0);
    expect(skipZeroDelayWait(g)).toBe(false);
    g.clearTimeout(due);
    const other = setImmediate(() => {});
    expect(skipZeroDelayWait(g)).toBe(false);
    clearImmediate(other);
    const timeout = g.setTimeout;
    g.setTimeout = Object.assign(() => ({}) as never, { clock: {} });
    expect(skipZeroDelayWait(g)).toBe(false);
    g.setTimeout = timeout;
    g.setImmediate = Object.assign(() => {}, { clock: {} });
    expect(skipZeroDelayWait(g)).toBe(false);
    g.setImmediate = Object.assign(() => {}, { _isMockFunction: true });
    expect(skipZeroDelayWait(g)).toBe(false);
    g.setImmediate = undefined;
    expect(skipZeroDelayWait(g)).toBe(false);
    expect(clock.skipped).toBe(0);
  });

  test("skipZeroDelayWait: false without a clock that skips idle time (the 0 ms timer waits for real)", () => {
    const g = setup(false) as G & Record<PropertyKey, unknown>;
    g.setImmediate = setImmediate;
    expect(skipZeroDelayWait(g)).toBe(false);
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

describe("Node's Timeout semantics — https://nodejs.org/api/timers.html#class-timeout", () => {
  test("the host timer is ref'd while any pending timer is, also when that timer is not the earliest", () => {
    const g = setup(false);
    const host = () => installed!.clock.hostTimer as unknown as { hasRef(): boolean };
    const early = g.setTimeout(() => {}, 20).unref();
    const late = g.setTimeout(() => {}, 40);
    expect(host().hasRef()).toBe(true); // the process waits for `late`
    g.clearTimeout(late);
    expect(host().hasRef()).toBe(false); // only the unref'd one is left: the process may exit
    g.clearTimeout(early);
  });

  test("refresh() does nothing on a cleared timer or after the clock is disposed", async () => {
    const g = setup(false);
    let fired = 0;
    const h = g.setTimeout(() => fired++, 1);
    g.clearTimeout(h);
    h.refresh();
    await new Promise((r) => setTimeout(r, 15));
    expect(fired).toBe(0);
    installed!.clock.dispose();
    h.refresh();
    expect(installed!.clock.size).toBe(0);
  });

  test("refresh() on a fired unref'd timer keeps it on real time while skipping", async () => {
    const g = setup(true);
    let fired = 0;
    const h = g.setTimeout(() => fired++, 30);
    h.unref();
    await new Promise((r) => setTimeout(r, 45));
    expect(fired).toBe(1);
    const start = performance.now();
    h.refresh();
    await new Promise((r) => setTimeout(r, 10));
    expect(fired).toBe(1); // not skipped to: 30 real ms have not passed
    await new Promise((r) => setTimeout(r, 35));
    expect(fired).toBe(2);
    expect(performance.now() - start).toBeGreaterThanOrEqual(25);
  });

  test("_destroyed is true once a one-shot ran or a timer was cleared (window timer tracking sweeps on it)", async () => {
    const g = setup(true);
    const a = g.setTimeout(() => {}, 5) as unknown as { _destroyed: boolean };
    const b = g.setTimeout(() => {}, 50_000) as unknown as { _destroyed: boolean };
    expect(a._destroyed).toBe(false);
    await sleep(g, 10);
    expect(a._destroyed).toBe(true);
    g.clearTimeout(b);
    expect(b._destroyed).toBe(true);
  });

  test("real time: a chain of 1 ms timers is not run early (each hop waits its millisecond)", async () => {
    const g = setup(false);
    const start = performance.now();
    await new Promise<void>((resolve) => {
      let hops = 0;
      const hop = () => {
        if (++hops === 200) return resolve();
        g.setTimeout(hop, 1);
        g.setTimeout(() => {}, 1); // a sibling due with the next hop
      };
      g.setTimeout(hop, 1);
      g.setTimeout(() => {}, 1);
    });
    expect(performance.now() - start).toBeGreaterThanOrEqual(150);
  });

  test("an interval delayed by a stalled callback re-arms one period after it ran, not back to back", async () => {
    const g = setup(false);
    const runs: number[] = [];
    await new Promise<void>((resolve) => {
      const i = g.setInterval(() => {
        runs.push(performance.now());
        if (runs.length === 1) {
          const until = performance.now() + 60;
          while (performance.now() < until); // stall past two periods
        }
        if (runs.length === 3) {
          g.clearInterval(i);
          resolve();
        }
      }, 20);
    });
    expect(runs[2] - runs[1]).toBeGreaterThanOrEqual(15);
  });
});

describe("idle time skipping: robustness", () => {
  test("a callback that throws does not stop skipping to the next timer", async () => {
    const g = setup(true);
    const errors: unknown[] = [];
    const onError = (error: unknown) => errors.push(error);
    process.on("uncaughtException", onError);
    try {
      g.setTimeout(() => {
        throw new Error("boom");
      }, 100);
      const start = performance.now();
      await sleep(g, 5_000);
      expect(errors).toHaveLength(1);
      expect(performance.now() - start).toBeLessThan(1_000);
    } finally {
      process.off("uncaughtException", onError);
    }
  });

  test("stdin opened after install (the first import of node:process) does not stop skipping", async () => {
    // A fresh process with stdin on a pipe, so nothing has imported node:process yet: install the
    // clock, then import it (its ESM namespace reads every process property, opening stdin).
    const clockUrl = new URL("../../src/window/clock.ts", import.meta.url).href;
    const script = `
      const { VirtualClock, installClock } = await import(${JSON.stringify(clockUrl)});
      const g = { Date, performance };
      const installed = installClock(new VirtualClock({ skip: true }), g);
      await import("node:process");
      const start = performance.now();
      await new Promise((resolve) => g.setTimeout(resolve, 5000));
      console.log(Math.round(performance.now() - start));
      installed.uninstall();
      process.exit(0);
    `;
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    await new Promise((resolve) => child.on("exit", resolve));
    expect(Number(out.trim())).toBeLessThan(1_000);
  });

  test("dispose() without uninstall (VM pools) leaves no active clock behind", async () => {
    const { clockSkipping } = await import("../../src/window/clock.ts");
    setup(true);
    expect(clockSkipping()).toBe(true);
    installed!.clock.dispose();
    expect(clockSkipping()).toBe(false);
  });

  test("performance.mark() and measure() use the virtual now: marks follow skipped time, measures are not negative (https://w3c.github.io/user-timing/#dom-performance-mark)", async () => {
    const g = setup(true);
    await sleep(g, 10_000);
    const now = g.performance.now();
    const mark = g.performance.mark("ctrl-dom-after-skip") as unknown as { startTime: number };
    expect(mark.startTime).toBeGreaterThanOrEqual(now);
    const measure = g.performance.measure("ctrl-dom-span", { start: now }) as unknown as { duration: number };
    expect(measure.duration).toBeGreaterThanOrEqual(0);
    expect(measure.duration).toBeLessThan(1_000);
    performance.clearMarks("ctrl-dom-after-skip");
    performance.clearMeasures("ctrl-dom-span");
  });
});

describe("async context — https://nodejs.org/api/async_context.html#class-asynclocalstorage", () => {
  test("a timer callback runs in the async context it was scheduled in, as Node's timers do", async () => {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    for (const skip of [false, true]) {
      const g = setup(skip);
      const store = new AsyncLocalStorage<string>();
      const seen: (string | undefined)[] = [];
      await new Promise<void>((resolve) => {
        store.run("A", () => g.setTimeout(() => seen.push(store.getStore()), 5));
        store.run("B", () => g.setTimeout(() => seen.push(store.getStore()), 5));
        g.setTimeout(() => resolve(), 10);
      });
      expect(seen).toEqual(["A", "B"]);
      installed!.uninstall();
      installed = null;
    }
  });

  test("an interval keeps its scheduling context on every run; an unref'd timer while skipping (real time) too", async () => {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    const g = setup(true);
    const store = new AsyncLocalStorage<string>();
    const seen: (string | undefined)[] = [];
    await new Promise<void>((resolve) => {
      store.run("interval", () => {
        const i = g.setInterval(() => {
          seen.push(store.getStore());
          if (seen.length === 2) g.clearInterval(i);
        }, 5);
      });
      store.run("unref", () => {
        const h = g.setTimeout(() => {
          seen.push(store.getStore());
          resolve();
        }, 20);
        h.unref();
      });
    });
    expect(seen).toEqual(["interval", "interval", "unref"]);
  });
});
