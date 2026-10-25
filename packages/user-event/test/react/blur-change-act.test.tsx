/**
 * The `change` user-event dispatches when a typed-into input blurs, when the blur is app code's
 * own `dispatchEvent` inside an `await act(async () => …)` flush (downstream: react-spectrum RAC
 * Autocomplete "async filtering … autofocus the first item when typing forward",
 * downstream/react-aria/TRIAGE.md, cluster 10).
 *
 * Finding: user-event version pin, not our port. user-event 14.6.8 dispatches that `change`
 * through `dispatchDOMEvent` → `wrapEvent` → RTL's `eventWrapper`, a synchronous `act()`. It
 * runs while the outer async act is flushing its queue at scope depth 0, so when it finishes it
 * clears React's act queue, and every update the flush schedules afterwards warns "An update to
 * … inside a test was not wrapped in act(...)". react-spectrum pins 14.6.5, whose CommonJS build
 * (the one Jest loads) dispatches `new Event('change')` directly, without `act()` (its ESM build
 * already used `dispatchDOMEvent`). This test pins that @ctrl/dom/user-event and stock 14.6.8 produce
 * the same act() warnings. React also logs "A component suspended inside an `act` scope …" for
 * the first such nested act() in a process; that warning is deduplicated, so only the per-update
 * warnings are compared.
 *
 * Upstream: https://github.com/testing-library/user-event/blob/v14.6.8/src/document/prepareDocument.ts
 */

import React, {useEffect, useRef, useState} from 'react'
import * as stockRTL from '@testing-library/react'
import {userEvent as stockUserEvent} from '@testing-library/user-event'
import {describe, expect, test, vi} from 'vitest'
import ctrlDomUserEvent from '../../src/index.ts'
import * as ctrlDomRTL from '../upstream/_helpers/react.ts'

type UE = typeof stockUserEvent
type RTL = Pick<typeof stockRTL, 'render' | 'screen' | 'cleanup' | 'act'>

const impls: Array<[string, UE, RTL]> = [
  [
    '@ctrl/dom/user-event',
    ctrlDomUserEvent as unknown as UE,
    ctrlDomRTL as unknown as RTL,
  ],
  ['@testing-library/user-event', stockUserEvent, stockRTL],
]

let startBlur: () => void = () => {}

/** Blurs its input from an effect, like React Aria's `dispatchVirtualBlur`, then updates state. */
function BlurFromEffect({log}: {log: string[]}) {
  const [value, setValue] = useState('')
  const [blurring, setBlurring] = useState(false)
  const [, setAfterBlur] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  startBlur = () => setBlurring(true)
  useEffect(() => {
    if (!blurring) return
    ref.current!.dispatchEvent(new FocusEvent('blur'))
    setAfterBlur(1)
  }, [blurring])
  return (
    <input
      aria-label="filter"
      ref={ref}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => log.push('blur')}
    />
  )
}

async function run([, userEvent, {render, screen, cleanup, act}]: [
  string,
  UE,
  RTL,
]) {
  const log: string[] = []
  const errors: string[] = []
  const spy = vi
    .spyOn(console, 'error')
    .mockImplementation((message: unknown) => {
      const line = String(message).split('\n')[0]
      if (line.startsWith('An update to')) errors.push(line)
    })
  try {
    render(<BlurFromEffect log={log} />)
    const input = screen.getByRole('textbox')
    input.addEventListener('change', () => log.push('change'))
    const user = userEvent.setup({delay: null})
    await user.type(input, 'F')
    await act(async () => {
      startBlur()
    })
  } finally {
    spy.mockRestore()
    cleanup()
  }
  return {log, errors}
}

describe('change on blur from an effect inside an async act() flush (React)', () => {
  test('same events and act() warnings as stock 14.6.8', async () => {
    const ours = await run(impls[0])
    const stock = await run(impls[1])
    expect(ours).toEqual(stock)
    expect(ours.log).toEqual(['change'])
    // 14.6.8: the act() around the change empties React's act queue mid-flush.
    expect(ours.errors).toEqual([
      'An update to %s inside a test was not wrapped in act(...).',
    ])
  })
})
