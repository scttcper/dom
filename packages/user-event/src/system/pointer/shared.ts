// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/system/pointer/shared.ts

import type {Element, Node} from '../../dom-types.ts'
import {type PointerCoords} from '../../event/index.ts'
import {MouseButton} from './buttons.ts'

export interface pointerKey {
  /** Name of the pointer key */
  name: string
  /** Type of the pointer device */
  pointerType: 'mouse' | 'pen' | 'touch'
  /** Type of button */
  button?: MouseButton
}

export interface PointerPosition {
  target?: Element
  coords?: PointerCoords
  caret?: CaretPosition
}

export interface CaretPosition {
  node?: Node
  offset?: number
}

/** Positions outlive an action so a later move or release can continue from the same place. */
export class PointerLocation implements PointerPosition {
  readonly targetRef?: WeakRef<Element>
  readonly coords?: PointerCoords
  readonly caret?: CaretPosition

  static from(position: PointerPosition) {
    return position instanceof PointerLocation
      ? position
      : new PointerLocation(position)
  }

  constructor(
    {target, coords, caret}: PointerPosition,
    previous?: PointerLocation,
  ) {
    if (target)
      this.targetRef =
        previous?.target === target ? previous.targetRef : new WeakRef(target)
    this.coords = coords
    if (caret?.node) this.caret = new CaretLocation(caret.node, caret.offset)
    else if (caret?.offset !== undefined) this.caret = {offset: caret.offset}
  }

  get target() {
    return this.targetRef?.deref()
  }
}

class CaretLocation implements CaretPosition {
  readonly #node: WeakRef<Node>
  readonly offset?: number

  constructor(node: Node, offset?: number) {
    this.#node = new WeakRef(node)
    this.offset = offset
  }

  get node() {
    return this.#node.deref()
  }
}

/** The PointerCoords members upstream compares, in its order. */
const COORDS = [
  'x',
  'y',
  'clientX',
  'clientY',
  'offsetX',
  'offsetY',
  'pageX',
  'pageY',
  'screenX',
  'screenY',
] as const

export function isDifferentPointerPosition(
  positionA: PointerPosition,
  positionB: PointerPosition,
) {
  if (positionA.target !== positionB.target) return true
  const a = positionA.coords
  const b = positionB.coords
  for (let i = 0; i < COORDS.length; i++) {
    if (a?.[COORDS[i]] !== b?.[COORDS[i]]) return true
  }
  return (
    positionA.caret?.node !== positionB.caret?.node ||
    positionA.caret?.offset !== positionB.caret?.offset
  )
}
