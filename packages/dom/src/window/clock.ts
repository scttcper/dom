// Virtual clock with idle time skipping.
//
// A test that awaits `findBy*`/`waitFor`/`user.click()`/`setTimeout` mostly waits for the app's
// own timers (debounces, mocked API latency, Suspense throttling, polling) or for waitFor's 50 ms
// interval and 1 s timeout. Nothing else can happen during those gaps: no microtask, no
// `setImmediate` (React's scheduler in Node), no I/O. Sleeping through them is pure wall time.
//
// The clock owns the timers created through the functions it installs (`setTimeout`,
// `setInterval`, their clears, and through them `window.setTimeout`, rAF and idle callbacks):
// they live in one binary heap driven by a single real host timer, so with skipping off they
// fire exactly when Node would have fired them. With skipping on, whenever the event loop is
// idle — no pending immediates and no I/O resource beyond the baseline — the clock jumps
// straight to the earliest timer: the skipped interval is added to the clock's offset, so
// `Date`, `performance.now()`, `event.timeStamp` and rAF timestamps all advance by it and app
// code sees time pass consistently (lodash's Date.now-based debounce, React's scheduler).
//
// Ordering is preserved: timers fire in (due, creation) order, one per macrotask (microtasks
// drain between them, as in Node), and only the earliest pending timer is ever skipped to, so
// a test awaiting a 50 ms timer resumes before a 300 ms debounce fires. Real I/O (sockets, fs,
// child processes, worker ports) blocks skipping, so real latency is never "skipped through".
//
// Unref'd timers stay on real time. `timeout.unref()` says "background: don't keep the process
// alive for me" — RPC and request timeouts (Vitest's birpc arms one per module fetch),
// watchdogs — never something a test waits for (browser code cannot even call it). While
// skipping, an unref'd timer moves to its own real host timer, so skipping to a later app timer
// can never fire an RPC timeout while that RPC is still in flight.
//
// HTML timer semantics: https://html.spec.whatwg.org/#timers (the map of active timers, run
// steps after a timeout). Node's Timeout object API (ref/unref/hasRef/refresh/close,
// Symbol.toPrimitive): https://nodejs.org/api/timers.html#class-timeout.

type Callback = (...args: unknown[]) => unknown;

const hostSetTimeout = globalThis.setTimeout;
const hostClearTimeout = globalThis.clearTimeout;
const hostSetImmediate = globalThis.setImmediate;
const hostPerformance = globalThis.performance;
const realNow = hostPerformance.now.bind(hostPerformance);
const getActiveResourcesInfo =
  typeof process === "object" && typeof process.getActiveResourcesInfo === "function" ? process.getActiveResourcesInfo.bind(process) : null;

/** Resource types that never block skipping: timers (the clock's own host timer, the test runner's) and immediates (checked separately). */
const NON_IO = new Set(["Timeout", "Immediate"]);

/** One pending timer. */
class TimerRecord {
  id: number;
  due: number;
  seq: number;
  delay: number;
  repeat: boolean;
  callback: Callback;
  args: unknown[];
  ref: boolean;
  /** Index in the heap, -1 when not scheduled (fired one-shot, cleared, real-time track). */
  index: number;
  handle: VirtualTimeout | null;
  /** Real host timer while on the real-time track (unref'd while skipping), else null. */
  real: ReturnType<typeof setTimeout> | null;
  /** realNow() at which `real` fires. */
  realDue: number;

  constructor(id: number, due: number, seq: number, delay: number, repeat: boolean, callback: Callback, args: unknown[]) {
    this.id = id;
    this.due = due;
    this.seq = seq;
    this.delay = delay;
    this.repeat = repeat;
    this.callback = callback;
    this.args = args;
    this.ref = true;
    this.index = -1;
    this.handle = null;
    this.real = null;
    this.realDue = 0;
  }
}

/** The handle setTimeout/setInterval return: Node's Timeout API surface. */
export class VirtualTimeout {
  #clock: VirtualClock;
  #record: TimerRecord;

  constructor(clock: VirtualClock, record: TimerRecord) {
    this.#clock = clock;
    this.#record = record;
  }

  ref(): this {
    this.#clock._setRef(this.#record, true);
    return this;
  }

  unref(): this {
    this.#clock._setRef(this.#record, false);
    return this;
  }

  hasRef(): boolean {
    return this.#record.ref;
  }

  /** Restart the timer with its original delay from now. */
  refresh(): this {
    this.#clock._refresh(this.#record);
    return this;
  }

  close(): this {
    this.#clock.clear(this.#record.id);
    return this;
  }

  [Symbol.toPrimitive](): number {
    return this.#record.id;
  }

  [Symbol.dispose](): void {
    this.#clock.clear(this.#record.id);
  }
}

function before(a: TimerRecord, b: TimerRecord): boolean {
  return a.due < b.due || (a.due === b.due && a.seq < b.seq);
}

export interface VirtualClockOptions {
  /** Jump to the next timer whenever the event loop is idle (default false: real time only). */
  skip?: boolean;
}

/**
 * Timers on a min-heap, a monotonic `now()` (real time + skipped time), and the idle driver that
 * skips. One clock per window/test file; dispose() drops every pending timer.
 */
export class VirtualClock {
  /** ms added to real time by skipping. */
  skipped: number;
  /** Date.now() - performance.now() when the clock was created (epoch of now() = 0). */
  epochOffset: number;
  skip: boolean;
  heap: TimerRecord[];
  byId: Map<number, TimerRecord>;
  nextId: number;
  seq: number;
  refCount: number;
  hostTimer: ReturnType<typeof setTimeout> | null;
  hostDue: number;
  continuation: boolean;
  driverScheduled: boolean;
  idleTurns: number;
  disposed: boolean;
  baseline: Map<string, number> | null;

  constructor(options: VirtualClockOptions = {}) {
    this.skipped = 0;
    this.epochOffset = Date.now() - realNow();
    this.skip = options.skip === true;
    this.heap = [];
    this.byId = new Map();
    this.nextId = 1;
    this.seq = 0;
    this.refCount = 0;
    this.hostTimer = null;
    this.hostDue = Infinity;
    this.continuation = false;
    this.driverScheduled = false;
    this.idleTurns = 0;
    this.disposed = false;
    if (this.skip) {
      // Node opens stdout/stderr lazily, on first access. A clock installed before anything has
      // logged (a --import preload, a setup file) would otherwise count the reporter's first
      // write as pending I/O and stop skipping for the rest of the run.
      if (typeof process === "object") {
        void process.stdout;
        void process.stderr;
      }
      this.baseline = countIO();
    } else {
      this.baseline = null;
    }
  }

  /** Monotonic ms (performance.now() origin) including skipped time. */
  now(): number {
    return realNow() + this.skipped;
  }

  /** Epoch ms including skipped time (Date.now()). */
  epochNow(): number {
    return Math.floor(this.epochOffset + realNow() + this.skipped);
  }

  /** https://html.spec.whatwg.org/#timer-initialisation-steps (delay clamped at 0; Node's 1 ms minimum is not imitated). */
  schedule(callback: Callback, delay: unknown, args: unknown[], repeat: boolean): VirtualTimeout {
    let ms = Number(delay);
    if (!(ms > 0)) ms = 0;
    if (repeat && ms < 1) ms = 1; // an interval of 0 would spin the heap
    const record = new TimerRecord(this.nextId++, this.now() + ms, this.seq++, ms, repeat, callback, args);
    const handle = new VirtualTimeout(this, record);
    record.handle = handle;
    if (this.disposed) return handle; // closed window: nothing runs (https://html.spec.whatwg.org/#close-a-browsing-context)
    this.byId.set(record.id, record);
    this.refCount++;
    this.push(record);
    this.armHost();
    this.kickDriver();
    return handle;
  }

  /** clearTimeout/clearInterval: a VirtualTimeout or its numeric id. Returns false for foreign handles. */
  clear(handle: unknown): boolean {
    const id = typeof handle === "number" ? handle : handle instanceof VirtualTimeout ? Number(handle) : NaN;
    const record = this.byId.get(id);
    if (record === undefined) return false;
    this.byId.delete(id);
    if (record.ref) this.refCount--;
    if (record.real !== null) {
      hostClearTimeout(record.real);
      record.real = null;
    }
    if (record.index !== -1) {
      this.remove(record);
      this.armHost();
    }
    return true;
  }

  /** Pending (scheduled) timers. */
  get size(): number {
    return this.byId.size;
  }

  _setRef(record: TimerRecord, ref: boolean): void {
    if (record.ref === ref) return;
    record.ref = ref;
    const live = this.byId.has(record.id);
    if (live) this.refCount += ref ? 1 : -1;
    if (live && this.skip) {
      if (!ref && record.index !== -1) this.toRealTrack(record, Math.max(0, record.due - this.now()));
      else if (ref && record.real !== null) this.toVirtualTrack(record);
    }
    this.updateHostRef();
  }

  /** Move `record` off the heap onto its own unref'd real host timer firing in `delay` ms. */
  toRealTrack(record: TimerRecord, delay: number): void {
    if (record.index !== -1) {
      this.remove(record);
      this.armHost();
    }
    record.realDue = realNow() + delay;
    const real = hostSetTimeout(() => this.fireReal(record), delay) as unknown as { unref?(): void };
    real.unref?.();
    record.real = real as unknown as ReturnType<typeof setTimeout>;
  }

  toVirtualTrack(record: TimerRecord): void {
    hostClearTimeout(record.real!);
    record.real = null;
    record.due = this.now() + Math.max(0, record.realDue - realNow());
    record.seq = this.seq++;
    this.push(record);
    this.armHost();
    this.kickDriver();
  }

  fireReal(record: TimerRecord): void {
    record.real = null;
    if (this.disposed || !this.byId.has(record.id)) return;
    if (record.repeat) this.toRealTrack(record, record.delay);
    else this.byId.delete(record.id);
    record.callback.apply(record.handle, record.args);
  }

  _refresh(record: TimerRecord): void {
    if (record.real !== null) {
      hostClearTimeout(record.real);
      record.real = null;
      this.toRealTrack(record, record.delay);
      return;
    }
    if (!this.byId.has(record.id)) {
      // Node: refresh() on a fired one-shot reschedules it.
      this.byId.set(record.id, record);
      if (record.ref) this.refCount++;
    } else if (record.index !== -1) {
      this.remove(record);
    }
    record.due = this.now() + record.delay;
    record.seq = this.seq++;
    this.push(record);
    this.armHost();
    this.kickDriver();
  }

  dispose(): void {
    this.disposed = true;
    for (const record of this.byId.values()) {
      if (record.real !== null) hostClearTimeout(record.real);
      record.real = null;
    }
    if (this.hostTimer !== null) hostClearTimeout(this.hostTimer);
    this.hostTimer = null;
    this.heap.length = 0;
    this.byId.clear();
    this.refCount = 0;
  }

  // --- firing -------------------------------------------------------------------------------

  /** Keep one real host timer armed for the earliest due timer (ref'd while any timer is). */
  armHost(): void {
    if (this.disposed || this.continuation) return;
    const first = this.heap[0];
    if (first === undefined) {
      if (this.hostTimer !== null) hostClearTimeout(this.hostTimer);
      this.hostTimer = null;
      this.hostDue = Infinity;
      return;
    }
    if (this.hostTimer !== null && this.hostDue === first.due) return;
    if (this.hostTimer !== null) hostClearTimeout(this.hostTimer);
    this.hostDue = first.due;
    this.hostTimer = hostSetTimeout(this.onHostTimer, Math.max(0, first.due - this.now()));
    this.updateHostRef();
  }

  updateHostRef(): void {
    const timer = this.hostTimer as unknown as { ref?(): void; unref?(): void } | null;
    if (timer === null) return;
    if (this.refCount > 0) timer.ref?.();
    else timer.unref?.();
  }

  onHostTimer = (): void => {
    this.hostTimer = null;
    this.hostDue = Infinity;
    this.fireNext();
  };

  /**
   * Run the earliest timer if it is due, then continue with the next due one on the following
   * macrotask (setImmediate: microtasks drain in between, as between Node timers).
   */
  fireNext(): void {
    this.continuation = false;
    if (this.disposed) return;
    const first = this.heap[0];
    // Host timers can fire a fraction of a ms early relative to performance.now().
    if (first === undefined || first.due > this.now() + 1) {
      this.armHost();
      return;
    }
    this.pop();
    if (first.repeat) {
      first.due = Math.max(first.due + first.delay, this.now());
      first.seq = this.seq++;
      this.push(first);
    } else {
      this.byId.delete(first.id);
      if (first.ref) this.refCount--;
    }
    const next = this.heap[0];
    if (next !== undefined && next.due <= this.now() + 1) {
      this.continuation = true;
      hostSetImmediate(() => this.fireNext());
    } else {
      this.armHost();
    }
    // Last, so a throwing callback (reported by Node as an uncaught exception, as before)
    // leaves the clock consistent.
    first.callback.apply(first.handle, first.args);
  }

  // --- skipping -----------------------------------------------------------------------------

  kickDriver(): void {
    if (!this.skip || this.driverScheduled || this.disposed) return;
    this.driverScheduled = true;
    hostSetImmediate(this.driverTurn);
  }

  /**
   * Runs on the check phase. Skips to the earliest timer once the loop has been idle for two
   * consecutive turns (pending promise reactions and the immediates they schedule settle first).
   */
  driverTurn = (): void => {
    this.driverScheduled = false;
    if (this.disposed || this.heap.length === 0) {
      this.idleTurns = 0;
      return;
    }
    const busy = this.busy();
    if (busy !== null) {
      this.idleTurns = 0;
      if (busy === "immediate") this.kickDriver();
      else {
        // I/O in flight: look again shortly without spinning.
        this.driverScheduled = true;
        hostSetTimeout(() => {
          this.driverScheduled = false;
          this.kickDriver();
        }, 1);
      }
      return;
    }
    if (++this.idleTurns < 2) {
      this.kickDriver();
      return;
    }
    this.idleTurns = 0;
    const first = this.heap[0]!;
    const gap = first.due - this.now();
    if (gap > 0) this.skipped += gap;
    if (this.hostTimer !== null) hostClearTimeout(this.hostTimer);
    this.hostTimer = null;
    this.hostDue = Infinity;
    this.fireNext();
    this.kickDriver();
  };

  /** null when idle; "immediate" when immediates are pending; "io" when I/O beyond the baseline is. */
  busy(): "immediate" | "io" | null {
    if (getActiveResourcesInfo === null) return "io"; // cannot tell: never skip
    const counts = new Map<string, number>();
    const resources = getActiveResourcesInfo();
    for (let i = 0; i < resources.length; i++) {
      const type = resources[i];
      if (type === "Immediate") return "immediate";
      if (NON_IO.has(type)) continue;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    for (const [type, n] of counts) {
      if (n > (this.baseline!.get(type) ?? 0)) return "io";
    }
    return null;
  }

  // --- heap -----------------------------------------------------------------------------------

  push(record: TimerRecord): void {
    const heap = this.heap;
    record.index = heap.length;
    heap.push(record);
    this.up(record.index);
  }

  pop(): TimerRecord {
    const heap = this.heap;
    const top = heap[0]!;
    const last = heap.pop()!;
    top.index = -1;
    if (last !== top) {
      heap[0] = last;
      last.index = 0;
      this.down(0);
    }
    return top;
  }

  remove(record: TimerRecord): void {
    const heap = this.heap;
    const i = record.index;
    const last = heap.pop()!;
    record.index = -1;
    if (last !== record) {
      heap[i] = last;
      last.index = i;
      this.down(i);
      this.up(last.index);
    }
  }

  up(i: number): void {
    const heap = this.heap;
    const record = heap[i]!;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(record, heap[parent]!)) break;
      heap[i] = heap[parent]!;
      heap[i]!.index = i;
      i = parent;
    }
    heap[i] = record;
    record.index = i;
  }

  down(i: number): void {
    const heap = this.heap;
    const n = heap.length;
    const record = heap[i]!;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      const child = r < n && before(heap[r]!, heap[l]!) ? r : l;
      if (!before(heap[child]!, record)) break;
      heap[i] = heap[child]!;
      heap[i]!.index = i;
      i = child;
    }
    heap[i] = record;
    record.index = i;
  }
}

/** Counts of I/O resource types right now (the baseline skipping compares against). */
function countIO(): Map<string, number> {
  const counts = new Map<string, number>();
  if (getActiveResourcesInfo === null) return counts;
  for (const type of getActiveResourcesInfo()) {
    if (NON_IO.has(type)) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
}

// --- the clock the DOM reads (event.timeStamp) ---------------------------------------------

let activeClock: VirtualClock | null = null;

/** performance.now() of the active clock (event.timeStamp, https://dom.spec.whatwg.org/#dom-event-timestamp). */
export function clockNow(): number {
  return activeClock === null ? realNow() : activeClock.now();
}

/** Milliseconds the active clock has skipped (0 without one): what a traced span reads at start and end. */
export function clockSkipped(): number {
  return activeClock === null ? 0 : activeClock.skipped;
}

/** The active clock's skipped time and pending timers (for test observability), or null without one. */
export function clockStats(): { skippedMs: number; pendingTimers: number } | null {
  return activeClock === null ? null : { skippedMs: activeClock.skipped, pendingTimers: activeClock.size };
}

// --- installing on a global ------------------------------------------------------------------

type Global = Record<PropertyKey, unknown>;

/** A Date constructor reading `clock` (new Date(), Date(), Date.now()); everything else is the native one's. */
export function virtualDate(clock: VirtualClock, NativeDate: DateConstructor): DateConstructor {
  function Date(this: unknown, ...args: unknown[]): unknown {
    if (new.target === undefined) return new NativeDate(clock.epochNow()).toString();
    const date = args.length === 0 ? new NativeDate(clock.epochNow()) : Reflect.construct(NativeDate, args, NativeDate);
    if (new.target !== Date) Object.setPrototypeOf(date, new.target.prototype);
    return date;
  }
  Object.defineProperties(Date, {
    length: { value: 7 },
    prototype: { value: NativeDate.prototype, writable: false },
    now: { value: () => clock.epochNow(), writable: true, configurable: true },
    parse: { value: NativeDate.parse, writable: true, configurable: true },
    UTC: { value: NativeDate.UTC, writable: true, configurable: true },
  });
  return Date as unknown as DateConstructor;
}

/** A `performance` whose now() reads `clock`; the rest delegates to the native object. */
export function virtualPerformance(clock: VirtualClock, native: Performance): Performance {
  const perf = Object.create(Object.getPrototypeOf(native) as object) as Record<string, unknown>;
  for (let o: object | null = native; o !== null && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const key of Reflect.ownKeys(o)) {
      if (key === "constructor" || key in perf && Object.hasOwn(perf, key)) continue;
      const desc = Object.getOwnPropertyDescriptor(o, key)!;
      if (typeof desc.value === "function") {
        Object.defineProperty(perf, key, { value: (desc.value as Callback).bind(native), writable: true, configurable: true, enumerable: desc.enumerable });
      } else if (desc.get !== undefined) {
        Object.defineProperty(perf, key, { get: () => Reflect.get(native, key), configurable: true, enumerable: desc.enumerable });
      }
    }
  }
  Object.defineProperty(perf, "now", { value: () => clock.now(), writable: true, configurable: true, enumerable: true });
  return perf as unknown as Performance;
}

export interface InstalledClock {
  clock: VirtualClock;
  /** Restore the global's previous timer functions, Date and performance, and dispose the clock. */
  uninstall(): void;
}

/**
 * Put `clock`'s timers on `global` (setTimeout, setInterval, clearTimeout, clearInterval), plus a
 * virtual `Date` and `performance` when the clock skips. The functions are plain writable data
 * properties without a `clock`/`_isMockFunction` property, so Testing Library and user-event
 * keep treating them as real timers, and fake timers can install over and restore them.
 * Clearing a handle the clock does not own falls through to the host's clear.
 */
export function installClock(clock: VirtualClock, global: Global): InstalledClock {
  const saved = new Map<PropertyKey, PropertyDescriptor | undefined>();
  const define = (name: string, value: unknown) => {
    saved.set(name, Object.getOwnPropertyDescriptor(global, name));
    Object.defineProperty(global, name, { value, writable: true, enumerable: true, configurable: true });
  };
  const hostClearInterval = globalThis.clearInterval;
  const timers = {
    // Once disposed (the test file's window closed) nothing is scheduled and 0 is returned, as by
    // jsdom's closed window.
    setTimeout(callback: unknown, delay?: unknown, ...args: unknown[]): unknown {
      if (typeof callback !== "function") throw new TypeError('The "callback" argument must be of type function');
      return clock.disposed ? 0 : clock.schedule(callback as Callback, delay, args, false);
    },
    setInterval(callback: unknown, delay?: unknown, ...args: unknown[]): unknown {
      if (typeof callback !== "function") throw new TypeError('The "callback" argument must be of type function');
      return clock.disposed ? 0 : clock.schedule(callback as Callback, delay, args, true);
    },
    clearTimeout(handle?: unknown): void {
      if (handle == null) return;
      if (!clock.clear(handle)) hostClearTimeout(handle as never);
    },
    clearInterval(handle?: unknown): void {
      if (handle == null) return;
      if (!clock.clear(handle)) hostClearInterval(handle as never);
    },
  };
  // timers/promises-style `util.promisify(setTimeout)`.
  Object.defineProperty(timers.setTimeout, Symbol.for("nodejs.util.promisify.custom"), {
    value: (delay?: number, value?: unknown) => new Promise((resolve) => clock.schedule(resolve as Callback, delay, [value], false)),
  });
  for (const name of ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] as const) define(name, timers[name]);
  if (clock.skip) {
    // A contextified vm sandbox does not expose its realm's intrinsics as own properties: fall back
    // to this realm's Date (Date must follow the clock wherever its timers run, or Date-based
    // debounces would re-arm forever).
    const NativeDate = (typeof global.Date === "function" ? global.Date : Date) as DateConstructor;
    define("Date", virtualDate(clock, NativeDate));
    define("performance", virtualPerformance(clock, (global.performance as Performance | undefined) ?? hostPerformance));
    activeClock = clock;
  }
  return {
    clock,
    uninstall() {
      for (const [name, desc] of saved) {
        if (desc === undefined) delete global[name];
        else Object.defineProperty(global, name, desc);
      }
      saved.clear();
      if (activeClock === clock) activeClock = null;
      clock.dispose();
    },
  };
}
