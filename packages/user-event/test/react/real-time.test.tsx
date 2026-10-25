// @vitest-environment-options {"timeSkip": false}
/**
 * The yield between actions in real time (timeSkip: false), the only mode in which
 * @ctrl/dom/user-event may replace upstream's `setTimeout(resolve, 0)` with `setImmediate`
 * (src/utils/misc/wait.ts; docs/deviations.md, "user-event `delay: 0`"): every timer upstream's
 * wait would run must still run before the next action. Each scenario runs with
 * @ctrl/dom/user-event and with stock @testing-library/user-event@14.6.8; the assertions are
 * identical.
 */

import {clockStats} from '@ctrl/dom/internal'
import {userEvent as stockUserEvent} from '@testing-library/user-event'
import {describe, expect, test} from 'vitest'
import ctrlDomUserEvent from '../../src/index.ts'

type UE = typeof stockUserEvent

const impls: Array<[name: string, userEvent: UE]> = [
  ['@ctrl/dom/user-event', ctrlDomUserEvent as unknown as UE],
  ['@testing-library/user-event', stockUserEvent],
]

test('this file runs without idle time skipping', () => {
  expect(clockStats()).toBeNull()
})

describe.each(impls)('%s', (_name, userEvent) => {
  test('a 0 ms timer scheduled while another timer is cleared has run when the call resolves', async () => {
    // Downstream regression (Base UI Select typeahead): clear-then-schedule leaves the number
    // of active timers unchanged, so the yield must count timer creation, not live timers.
    const button = document.createElement('button')
    document.body.append(button)
    let pending: ReturnType<typeof setTimeout> | undefined
    let committed = ''
    button.addEventListener('keydown', e => {
      clearTimeout(pending)
      setTimeout(() => (committed = (e as unknown as {key: string}).key), 0)
    })
    button.focus()
    const user = userEvent.setup()
    let stale = 0
    for (let i = 0; i < 30; i++) {
      committed = ''
      pending = setTimeout(() => {}, 10_000)
      await user.keyboard('a')
      if (committed !== 'a') stale++
    }
    clearTimeout(pending)
    button.remove()
    expect(stale).toBe(0)
  })

  test('a 0 ms timer scheduled before the API call runs before its first action', async () => {
    // Downstream regression (Base UI Select: focus inside act() schedules a 0 ms timer that
    // registers the list; the keydown must see it). Upstream's wait before the first action
    // flushes it, so the yield must consider timers that were already pending.
    const button = document.createElement('button')
    document.body.append(button)
    let ready = false
    const seen: boolean[] = []
    button.addEventListener('keydown', () => seen.push(ready))
    button.focus()
    const user = userEvent.setup()
    for (let i = 0; i < 20; i++) {
      ready = false
      setTimeout(() => (ready = true), 0)
      await user.keyboard('a')
    }
    button.remove()
    expect(seen).toEqual(Array(20).fill(true))
  })
})
