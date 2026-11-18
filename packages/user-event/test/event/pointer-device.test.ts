import {expect, test} from 'vitest'
import {Device} from '../../src/system/pointer/device.ts'
import type {pointerKey} from '../../src/system/pointer/shared.ts'

test('a held touch stays counted once when another contact ends and restarts', () => {
  const device = new Device()
  const a: pointerKey = {pointerType: 'touch', name: 'TouchA'}
  const b: pointerKey = {pointerType: 'touch', name: 'TouchB'}

  device.addPressed(a)
  device.addPressed(b)
  expect(device.removePressed(a)).toBe(true)
  device.addPressed(b)
  expect(device.countPressed).toBe(1)
  expect(device.isPressed(b)).toBe(true)
  device.addPressed(a)
  expect(device.countPressed).toBe(2)
  expect(device.removePressed(b)).toBe(true)
  expect(device.removePressed(b)).toBe(false)
  expect(device.isPressed(a)).toBe(true)
  expect(device.removePressed(a)).toBe(true)
  expect(device.countPressed).toBe(0)
})
