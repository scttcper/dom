// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/wait.ts
//
// Deviation (docs/deviations.md, "user-event `delay: 0`"): upstream awaits
// `setTimeout(resolve, delay)` before every keyboard/pointer action and once more when an API
// call finishes. Node clamps a 0 ms timeout to 1 ms, so `type(input, 'hello world')` idles for
// ~14 ms of wall time — the dominant cost of user-event in real suites.
//
// `wait()` keeps upstream semantics exactly. `yieldBetweenActions()` (between actions and at the
// end of every API call) uses it unless all of these hold, in which case it yields with
// `setImmediate` instead:
// - `delay: 0`, the default `advanceTimers`, and `setImmediate` is not faked or spied on;
// - on @ctrl/dom's idle-skipping clock, no timer falls due in the next millisecond: the shortcut
//   then lets that millisecond pass on the clock, as upstream's wait does there (Node's minimum),
//   so time between actions advances as in real time and animation frames still run between
//   actions (React Aria restores focus in one);
// - the timer globals are still the observing wrappers installed below (fake timers or a
//   replaced global turn the shortcut off);
// - no pending timer created through them is due within DUE_SOON_MS — i.e. no timer that
//   upstream's wait would have run (pre-existing 0 ms timers, clear-then-schedule, rAF shims on
//   `setTimeout(0)` all force the upstream wait);
// - the number of live timeouts not created through the wrappers has not grown since the last
//   full wait (timers created through references captured before import).
// So every timer callback upstream's wait would run still runs before the next action and
// before `await user.click()` resolves.
// `setImmediate` is still a macrotask boundary: microtasks, React's scheduler tasks (React
// schedules with `setImmediate` in Node) and their effects run between actions as before. A
// render that runs past React's 5 ms slice (a busy machine) continues in an immediate queued
// behind ours, so after either wait user-event yields again while immediates other than the
// clock's own are queued, up to MAX_YIELD_HOPS (upstream's 1 ms timer can lose that race too).

import {immediatesPending, skipIdleTime} from '../../ctrl-dom.ts'
import {type Instance} from '../../setup/index.ts'

type TimerFn = ((...args: never[]) => unknown) & {
  clock?: unknown
  _isMockFunction?: boolean
}

/** Same detection as @testing-library/dom's `jestFakeTimersAreEnabled`; also matches sinon/vitest (`clock`) and spies. */
function isFaked(fn: TimerFn | undefined): boolean {
  return (
    fn !== undefined &&
    (fn._isMockFunction === true || Object.hasOwn(fn, 'clock'))
  )
}

export function defaultAdvanceTimers(): Promise<void> {
  return Promise.resolve()
}

export function wait(config: Instance['config']) {
  const delay = config.delay
  if (typeof delay !== 'number') {
    return
  }
  return Promise.all([
    new Promise<void>(resolve => globalThis.setTimeout(() => resolve(), delay)),
    config.advanceTimers(delay),
  ])
}

function resolveOnImmediate(resolve: () => void) {
  globalThis.setImmediate(resolve)
}

/** Active (ref'ed) timeouts and intervals in this process. */
function countTimeouts(): number {
  const resources = process.getActiveResourcesInfo()
  let n = 0
  for (let i = 0; i < resources.length; i++) {
    if (resources[i] === 'Timeout') n++
  }
  return n
}

// --- timer deadlines observed through the globals ---------------------------------------
//
// user-event wraps `globalThis.setTimeout`/`setInterval`/`clearTimeout`/`clearInterval` (when
// it is imported and again at the start of each API call if something replaced them) to know
// the deadline of every pending timer created through them. Upstream's wait,
// `setTimeout(resolve, 0)`, runs every timer due within ~1 ms before resolving; skipping it is
// only safe when no pending timer could be due that soon.

/** Timers due within this many ms of now count as "would run during upstream's wait". */
const DUE_SOON_MS = 4
/** A tracked timer this overdue has been cleared by a means we do not observe (e.g. numeric id). */
const STALE_MS = 50

interface PendingTimer {
  due: number
  interval: number
  /** The host handle (key in timerByHandle), so pruning a stale timer drops both entries. */
  handle: unknown
}

type TimerGlobals = {
  setTimeout: TimerFn
  setInterval: TimerFn
  clearTimeout: TimerFn
  clearInterval: TimerFn
}
type AnyFn = (...args: unknown[]) => unknown

const pendingTimers = new Set<PendingTimer>()
const timerByHandle = new Map<unknown, PendingTimer>()
const wrappers: Partial<TimerGlobals> = {}

function copyProps(wrapper: object, original: object) {
  // keep `util.promisify.custom`, `__promisify__`, name, length
  Object.defineProperties(wrapper, Object.getOwnPropertyDescriptors(original))
}

function wrapSchedule(name: 'setTimeout' | 'setInterval') {
  const g = globalThis as unknown as TimerGlobals
  const current = g[name]
  if (
    current === wrappers[name] ||
    typeof current !== 'function' ||
    isFaked(current)
  )
    return
  const original = current as unknown as AnyFn
  const isInterval = name === 'setInterval'
  const wrapper = function (
    this: unknown,
    callback: unknown,
    delay?: unknown,
    ...args: unknown[]
  ) {
    if (typeof callback !== 'function') {
      return original.call(this, callback, delay, ...args)
    }
    const ms = Math.max(1, Number(delay) || 0)
    const timer: PendingTimer = {
      due: performance.now() + ms,
      interval: isInterval ? ms : 0,
      handle: undefined,
    }
    pendingTimers.add(timer)
    let handle: unknown
    const run = function (this: unknown, ...runArgs: unknown[]) {
      if (isInterval) {
        timer.due = performance.now() + timer.interval
      } else {
        pendingTimers.delete(timer)
        timerByHandle.delete(handle)
      }
      return (callback as AnyFn).apply(this, runArgs)
    }
    handle = original.call(this, run, delay, ...args)
    timer.handle = handle
    timerByHandle.set(handle, timer)
    return handle
  } as unknown as TimerFn
  copyProps(wrapper, original)
  wrappers[name] = wrapper
  g[name] = wrapper
}

function wrapClear(name: 'clearTimeout' | 'clearInterval') {
  const g = globalThis as unknown as TimerGlobals
  const current = g[name]
  if (
    current === wrappers[name] ||
    typeof current !== 'function' ||
    isFaked(current)
  )
    return
  const original = current as unknown as AnyFn
  const wrapper = function (this: unknown, handle: unknown) {
    const timer = timerByHandle.get(handle)
    if (timer !== undefined) {
      pendingTimers.delete(timer)
      timerByHandle.delete(handle)
    }
    return original.call(this, handle)
  } as unknown as TimerFn
  copyProps(wrapper, original)
  wrappers[name] = wrapper
  g[name] = wrapper
}

function observeTimerGlobals() {
  wrapSchedule('setTimeout')
  wrapSchedule('setInterval')
  wrapClear('clearTimeout')
  wrapClear('clearInterval')
}

function timerGlobalsObserved(): boolean {
  const g = globalThis as unknown as TimerGlobals
  return (
    wrappers.setTimeout !== undefined &&
    g.setTimeout === wrappers.setTimeout &&
    g.setInterval === wrappers.setInterval &&
    g.clearTimeout === wrappers.clearTimeout &&
    g.clearInterval === wrappers.clearInterval
  )
}

/** Whether a timer created through the wrappers may be due within upstream's wait. */
function trackedTimerDueSoon(): boolean {
  const now = performance.now()
  for (const timer of pendingTimers) {
    if (timer.due <= now + DUE_SOON_MS) {
      if (timer.interval === 0 && timer.due < now - STALE_MS) {
        // Cleared through a reference captured before the wrappers: forget it entirely (the
        // handle would otherwise keep the timer's callback, and whatever it closes over, alive).
        pendingTimers.delete(timer)
        timerByHandle.delete(timer.handle)
        continue
      }
      return true
    }
  }
  return false
}

/**
 * Live timeouts not created through the wrappers (created before user-event was imported, or
 * through a reference captured earlier) as of the last full wait. Their deadlines are unknown;
 * any short one was flushed by that wait, so only an increase is suspicious.
 */
let untrackedBaseline = -1

function untrackedTimeouts(): number {
  const live = countTimeouts()
  let trackedRefed = 0
  for (const handle of timerByHandle.keys()) {
    if (
      typeof handle !== 'object' ||
      handle === null ||
      (handle as {hasRef?: () => boolean}).hasRef?.() !== false
    ) {
      trackedRefed++
    }
  }
  return live - trackedRefed
}

if (typeof globalThis.setImmediate === 'function') {
  observeTimerGlobals()
}

/** Start of an API call: re-install the observers if something replaced the timer globals. */
export function markTimers(config: Instance['config']) {
  if (config.delay === 0 && config.advanceTimers === defaultAdvanceTimers) {
    observeTimerGlobals()
  }
}

/** `delay: 0`, the default `advanceTimers`, and real timers: nothing replaced or faked. */
function realTimersAtZeroDelay(config: Instance['config']): boolean {
  if (config.delay !== 0 || config.advanceTimers !== defaultAdvanceTimers)
    return false
  const setImmediate = globalThis.setImmediate as TimerFn | undefined
  return (
    typeof setImmediate === 'function' &&
    !isFaked(setImmediate) &&
    timerGlobalsObserved()
  )
}

function canYieldWithImmediate(config: Instance['config']): boolean {
  if (!realTimersAtZeroDelay(config)) return false
  if (trackedTimerDueSoon()) return false
  const untracked = untrackedTimeouts()
  if (untrackedBaseline === -1 || untracked > untrackedBaseline) return false
  if (!skipIdleTime(1)) return false
  untrackedBaseline = untracked
  return true
}

/** Bound on repeated yields while other immediates are queued (a self-rescheduling immediate never settles). */
const MAX_YIELD_HOPS = 20

export function yieldBetweenActions(
  config: Instance['config'],
): Promise<unknown> | undefined {
  // With the shortcut off and nothing to track (fake timers replaced the observed globals), the
  // very promise upstream awaits: callers resolve after as many microtask turns as upstream's.
  // Work that settles in promise reactions (a mutation's onSuccess) races them: one async layer
  // more here, and the setState in onSuccess landed after the call's asyncWrapper had restored
  // React's act environment (Sentry's passwordReset.spec under jest.useFakeTimers()).
  if (!realTimersAtZeroDelay(config) && !timerGlobalsObserved()) {
    return wait(config)
  }
  return yieldAndSettle(config)
}

async function yieldAndSettle(config: Instance['config']) {
  if (canYieldWithImmediate(config)) {
    await new Promise<void>(resolveOnImmediate)
  } else {
    await wait(config)
    if (timerGlobalsObserved()) untrackedBaseline = untrackedTimeouts()
  }
  // After either wait: upstream's 1 ms timer can also fire before a busy render's continuation.
  if (realTimersAtZeroDelay(config)) {
    for (let hop = 0; hop < MAX_YIELD_HOPS && immediatesPending(); hop++) {
      await new Promise<void>(resolveOnImmediate)
    }
  }
}
