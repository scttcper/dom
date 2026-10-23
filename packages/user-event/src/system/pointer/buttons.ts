// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/system/pointer/buttons.ts

import {type pointerKey} from './shared.ts'

export class Buttons {
  private readonly pressed: Record<string, pointerKey[]> = {}
  /** `MouseEvent.buttons` of `pressed`, kept up to date instead of recomputed per event. */
  private mask = 0

  getButtons() {
    return this.mask
  }

  down(keyDef: pointerKey) {
    const button = getMouseButtonId(keyDef.button)

    if (button in this.pressed) {
      this.pressed[button].push(keyDef)
      return undefined
    }

    this.pressed[button] = [keyDef]
    this.mask |= 2 ** button
    return button
  }

  up(keyDef: pointerKey) {
    const button = getMouseButtonId(keyDef.button)

    if (button in this.pressed) {
      this.pressed[button] = this.pressed[button].filter(
        k => k.name !== keyDef.name,
      )
      if (this.pressed[button].length === 0) {
        delete this.pressed[button]
        this.mask &= ~(2 ** button)
        return button
      }
    }

    return undefined
  }
}

export const MouseButton = {
  primary: 0,
  secondary: 1,
  auxiliary: 2,
  back: 3,
  X1: 3,
  forward: 4,
  X2: 4,
} as const
export type MouseButton = keyof typeof MouseButton | number

export function getMouseButtonId(button: MouseButton = 0): number {
  if (button in MouseButton) {
    return MouseButton[button as keyof typeof MouseButton]
  }
  return Number(button)
}

// On the `MouseEvent.button` property auxiliary and secondary button are flipped compared to `MouseEvent.buttons`.
export const MouseButtonFlip = {
  1: 2,
  2: 1,
} as const
export function getMouseEventButton(button?: MouseButton): number {
  button = getMouseButtonId(button)
  if (button in MouseButtonFlip) {
    return MouseButtonFlip[button as keyof typeof MouseButtonFlip]
  }
  return button
}
