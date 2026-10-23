// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/system/pointer/device.ts

import {type pointerKey} from './index.ts'

export class Device {
  private pressedKeys = new Set<string>()

  get countPressed() {
    return this.pressedKeys.size
  }

  isPressed(keyDef: pointerKey) {
    return this.pressedKeys.has(keyDef.name)
  }

  addPressed(keyDef: pointerKey) {
    return this.pressedKeys.add(keyDef.name)
  }

  removePressed(keyDef: pointerKey) {
    return this.pressedKeys.delete(keyDef.name)
  }
}
