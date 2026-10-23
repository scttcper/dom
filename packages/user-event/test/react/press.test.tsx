/**
 * Keyboard press on a React component with React Aria-style `usePress` handling
 * (downstream: react-spectrum RAC Checkbox/Radio "should support press state with keyboard",
 * downstream/react-aria/TRIAGE.md #10).
 *
 * Finding: the double `onPress` is user-event 14.6.5 vs 14.6.8, not our port. react-spectrum
 * pins @testing-library/user-event 14.6.5, whose `click` after a Space keyup has
 * `pointerType: "undefined"` (`String(undefined)`); 14.6.8 fixed it to `""`
 * (testing-library/user-event#1325, 71a5475). React Aria's `isVirtualClick()` treats
 * `detail === 0 && !pointerType` as a virtual click and presses again, so stock 14.6.8 — the
 * version @rtd/user-event is a drop-in for — fires `onPress` twice exactly like we do.
 * This test pins that @rtd/user-event and stock 14.6.8 produce the same React-visible sequence.
 */

import React, {useRef} from 'react'
import * as stockRTL from '@testing-library/react'
import {userEvent as stockUserEvent} from '@testing-library/user-event'
import {describe, expect, test, vi} from 'vitest'
import rtdUserEvent from '../../src/index.ts'
import * as rtdRTL from '../upstream/_helpers/react.ts'

type UE = typeof stockUserEvent
type RTL = Pick<typeof stockRTL, 'render' | 'screen' | 'cleanup'>

const impls: Array<[string, UE, RTL]> = [
  ['@rtd/user-event', rtdUserEvent as unknown as UE, rtdRTL as unknown as RTL],
  ['@testing-library/user-event', stockUserEvent, stockRTL],
]

function isVirtualClick(e: MouseEvent & {pointerType?: string}) {
  if (e.pointerType === '' && e.isTrusted) return true
  return e.detail === 0 && !e.pointerType
}

function PressCheckbox({onPress, log}: {onPress: () => void; log: string[]}) {
  const state = useRef({isPressed: false})
  return (
    <label
      onKeyDown={e => {
        if (e.key !== ' ') return
        log.push(`keydown trusted=${e.nativeEvent.isTrusted}`)
        state.current.isPressed = true
        const up = (ev: KeyboardEvent) => {
          log.push('keyup(document)')
          state.current.isPressed = false
          onPress()
          document.removeEventListener('keyup', up, true)
        }
        document.addEventListener('keyup', up, true)
      }}
      onClick={e => {
        const n = e.nativeEvent as MouseEvent & {pointerType?: string}
        log.push(`click button=${e.button} detail=${n.detail} pt=${JSON.stringify(n.pointerType)} trusted=${n.isTrusted} pressed=${state.current.isPressed}`)
        if (e.button === 0 && !state.current.isPressed && isVirtualClick(n)) onPress()
      }}
    >
      <input type="checkbox" />
      Test
    </label>
  )
}

async function run([, userEvent, {render, screen, cleanup}]: [string, UE, RTL]) {
  const onPress = vi.fn()
  const log: string[] = []
  render(<PressCheckbox onPress={onPress} log={log} />)
  const user = userEvent.setup({delay: null})
  await user.tab()
  await user.keyboard('[Space>]')
  await user.keyboard('[/Space]')
  const checked = (screen.getByRole('checkbox') as HTMLInputElement).checked
  cleanup()
  return {log, presses: onPress.mock.calls.length, checked}
}

describe('Space press on a checkbox inside a usePress-like label (React)', () => {
  test('same React-visible event sequence and press count as stock 14.6.8', async () => {
    const ours = await run(impls[0])
    const stock = await run(impls[1])
    expect(ours).toEqual(stock)
    // 14.6.8: the keyup-triggered click is a "virtual" click (detail 0, pointerType '')
    expect(ours.log.at(-1)).toBe('click button=0 detail=0 pt="" trusted=false pressed=false')
    expect(ours.checked).toBe(true)
  })
})
