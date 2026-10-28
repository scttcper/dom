/**
 * How long an API call takes, in microtask turns, under fake timers with `advanceTimers`: work a
 * click starts that settles in promise reactions (a mutation's `onSuccess`) races the call's
 * `asyncWrapper`, which turns React's act environment back on when it finishes. A `setState` that
 * lands after that warns "An update to … inside a test was not wrapped in act(...)" (downstream:
 * Sentry's passwordReset.spec "counts down before navigating to sign-in", under
 * `jest.useFakeTimers()` with `advanceTimers: jest.advanceTimersByTime`).
 *
 * Finding: upstream awaits `wait(config)`'s promise itself between actions and at the end of each
 * call. @ctrl/dom/user-event awaited it inside an async helper, a turn or two more per wait, so
 * the same work settled at a different point of the call. This test pins that @ctrl/dom/user-event
 * and stock 14.6.8 take the same turns and produce the same act() warnings.
 *
 * Upstream: https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/wait.ts,
 * https://github.com/testing-library/user-event/blob/v14.6.8/src/setup/setup.ts (wrapAndBindImpl)
 */

import React, {useState} from 'react'
import * as stockRTL from '@testing-library/react'
import {userEvent as stockUserEvent} from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import ctrlDomUserEvent from '../../src/index.ts'
import * as ctrlDomRTL from '../upstream/_helpers/react.ts'

type UE = typeof stockUserEvent
type RTL = Pick<typeof stockRTL, 'render' | 'screen' | 'cleanup'>

const impls: Array<[string, UE, RTL]> = [
  [
    '@ctrl/dom/user-event',
    ctrlDomUserEvent as unknown as UE,
    ctrlDomRTL as unknown as RTL,
  ],
  ['@testing-library/user-event', stockUserEvent, stockRTL],
]

// RTL's asyncWrapper drains with `setTimeout(0)` and advances fake timers only when a global
// `jest` exists, as under Jest.
const g = globalThis as {jest?: unknown}
beforeEach(() => {
  g.jest = {advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms)}
})
afterEach(() => {
  delete g.jest
})

/** `turns` promise reactions, then a 0 ms timer if `timer`, then as many reactions again. */
async function settle(turns: number, timer: boolean) {
  for (let i = 0; i < turns; i++) await Promise.resolve()
  if (!timer) return
  await new Promise(resolve => setTimeout(resolve, 0))
  for (let i = 0; i < turns; i++) await Promise.resolve()
}

async function run(
  [, userEvent, {render, screen, cleanup}]: [string, UE, RTL],
  shapes: Array<[number, boolean]>,
) {
  const results: Array<{turns: number; inside: boolean; warned: boolean}> = []
  for (const [turns, timer] of shapes) {
    let warned = false
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((message: unknown) => {
        if (String(message).startsWith('An update to')) warned = true
      })
    vi.useFakeTimers()
    let counted = 0
    let counting = false
    const count = () => {
      if (!counting) return
      counted++
      void Promise.resolve().then(count)
    }
    let clicked = false
    let inside = false
    let finished = false
    function Submit() {
      const [, setDone] = useState(false)
      return (
        <button
          onClick={() => {
            counting = true
            void Promise.resolve().then(count)
            void settle(turns, timer).then(() => {
              inside = !clicked
              setDone(true)
              finished = true
            })
          }}
        >
          submit
        </button>
      )
    }
    try {
      render(<Submit />)
      const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime})
      await user.click(screen.getByRole('button'))
      clicked = true
      counting = false
      // The rest of the work (its 0 ms timer included) settles before the warnings are read.
      for (let i = 0; i < 500 && !finished; i++) {
        vi.advanceTimersByTime(0)
        await Promise.resolve()
      }
      results.push({turns: counted, inside, warned})
    } finally {
      vi.useRealTimers()
      spy.mockRestore()
      cleanup()
    }
  }
  return results
}

describe('promise work a click starts, under fake timers with advanceTimers (React)', () => {
  test('a click takes as many microtask turns as stock 14.6.8, so the same work settles before the act environment is restored and the same work warns', async () => {
    const shapes: Array<[number, boolean]> = [
      [0, false],
      [6, false],
      [7, false],
      [8, false],
      [9, false],
      [10, false],
      [20, false],
      [0, true],
      [1, true],
      [2, true],
      [3, true],
      [4, true],
    ]
    const ours = await run(impls[0], shapes)
    const stock = await run(impls[1], shapes)
    expect(ours).toEqual(stock)
    // The shapes straddle the end of the call: some settle while the act environment is off, and
    // some land after asyncWrapper turned it back on (before or after the click resolves) and warn.
    expect(new Set(stock.map(r => r.warned))).toEqual(new Set([true, false]))
  })
})
