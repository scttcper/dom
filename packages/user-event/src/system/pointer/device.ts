// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/system/pointer/device.ts

import {type pointerKey} from './index.ts'

export class Device {
  private first?: string
  private additional?: Set<string>

  get countPressed() {
    return Number(this.first !== undefined) + (this.additional?.size ?? 0)
  }

  isPressed({name}: pointerKey) {
    return this.first === name || (this.additional?.has(name) ?? false)
  }

  addPressed({name}: pointerKey) {
    if (this.first === undefined) {
      if (!this.additional?.has(name)) this.first = name
    } else if (this.first !== name) {
      ;(this.additional ??= new Set()).add(name)
    }
  }

  removePressed({name}: pointerKey) {
    if (this.first !== name) return this.additional?.delete(name) ?? false
    this.first = undefined
    return true
  }
}
