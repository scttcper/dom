// Retention helpers for the leak suite (vitest.leaks.config.ts runs it with --expose-gc).
//
// WeakRef targets stay alive until the end of the current job
// (https://tc39.es/ecma262/#sec-weakref-execution: KeepDuringJob / ClearKeptObjects), so every
// check yields a few macrotasks between forced collections before deref()-ing.

const gcFn = (globalThis as { gc?: () => void }).gc;

export function gc(): void {
  if (gcFn === undefined) throw new Error("leak suite needs --expose-gc (run it through vitest.leaks.config.ts)");
  gcFn();
}

const macrotask = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Several macrotask turns, each followed by a full GC. */
export async function collectGarbage(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await macrotask();
    gc();
  }
}

/** Tracks objects by label; `alive()` reports which labels still have live targets. */
export class Tracker {
  #refs: Array<[string, WeakRef<object>]> = [];

  track<T extends object>(label: string, target: T): T {
    this.#refs.push([label, new WeakRef(target)]);
    return target;
  }

  get size(): number {
    return this.#refs.length;
  }

  /** Labels with live targets after collecting garbage (retrying a few times), with counts. */
  async alive(rounds = 6): Promise<Record<string, number>> {
    let result: Record<string, number> = {};
    for (let round = 0; round < rounds; round++) {
      await collectGarbage(2);
      result = {};
      for (const [label, ref] of this.#refs) if (ref.deref() !== undefined) result[label] = (result[label] ?? 0) + 1;
      if (Object.keys(result).length === 0) break;
    }
    // Debugging: LEAK_SNAPSHOT=/path/prefix writes a heap snapshot when something is retained.
    if (Object.keys(result).length !== 0 && process.env.LEAK_SNAPSHOT) {
      await macrotask(); // let deref()'s KeepDuringJob set clear first
      const { writeHeapSnapshot } = await import("node:v8");
      writeHeapSnapshot(`${process.env.LEAK_SNAPSHOT}-${Date.now()}.heapsnapshot`);
    }
    return result;
  }
}

/** Heap used after forced GCs, in bytes. */
export async function heapAfterGC(): Promise<number> {
  await collectGarbage(3);
  return process.memoryUsage().heapUsed;
}

/** Least-squares slope of `points` ([x, y]) — bytes per cycle when x is a cycle count. */
export function slope(points: ReadonlyArray<readonly [number, number]>): number {
  const n = points.length;
  let mx = 0;
  let my = 0;
  for (const [x, y] of points) {
    mx += x / n;
    my += y / n;
  }
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return num / den;
}

/**
 * Run `cycle` `warmup + samples * every` times, sampling heap-after-GC every `every` cycles after
 * the warmup, and return the least-squares slope in bytes per cycle.
 */
export async function heapSlope(
  cycle: (i: number) => void | Promise<void>,
  { warmup = 50, samples = 8, every = 50 } = {},
): Promise<{ bytesPerCycle: number; points: Array<[number, number]> }> {
  let i = 0;
  for (; i < warmup; i++) await cycle(i);
  const points: Array<[number, number]> = [[i, await heapAfterGC()]];
  for (let s = 0; s < samples; s++) {
    for (let k = 0; k < every; k++, i++) await cycle(i);
    points.push([i, await heapAfterGC()]);
  }
  return { bytesPerCycle: slope(points), points };
}
