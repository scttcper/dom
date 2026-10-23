// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/convenience/click.ts

import type {Element} from '../dom-types.ts'
import {type PointerInput} from '../pointer/index.ts'
import {type Instance} from '../setup/index.ts'

export async function click(this: Instance, element: Element): Promise<void> {
  const pointerIn: PointerInput = []
  if (!this.config.skipHover) {
    pointerIn.push({target: element})
  }
  pointerIn.push({keys: '[MouseLeft]', target: element})

  return this.pointer(pointerIn)
}

export async function dblClick(
  this: Instance,
  element: Element,
): Promise<void> {
  return this.pointer([{target: element}, '[MouseLeft][MouseLeft]'])
}

export async function tripleClick(
  this: Instance,
  element: Element,
): Promise<void> {
  return this.pointer([{target: element}, '[MouseLeft][MouseLeft][MouseLeft]'])
}
