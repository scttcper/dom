// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/convenience/hover.ts

import type {Element} from '../dom-types.ts'
import {type Instance} from '../setup/index.ts'
import {assertPointerEvents} from '../utils/index.ts'

export async function hover(this: Instance, element: Element) {
  return this.pointer({target: element})
}

export async function unhover(this: Instance, element: Element) {
  assertPointerEvents(this, this.system.pointer.getMouseTarget(this))
  return this.pointer({target: element.ownerDocument.body})
}
