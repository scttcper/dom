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

export function isDifferentPointerPosition(
  positionA: PointerPosition,
  positionB: PointerPosition,
) {
  return (
    positionA.target !== positionB.target ||
    positionA.coords?.x !== positionB.coords?.x ||
    positionA.coords?.y !== positionB.coords?.y ||
    positionA.coords?.clientX !== positionB.coords?.clientX ||
    positionA.coords?.clientY !== positionB.coords?.clientY ||
    positionA.coords?.offsetX !== positionB.coords?.offsetX ||
    positionA.coords?.offsetY !== positionB.coords?.offsetY ||
    positionA.coords?.pageX !== positionB.coords?.pageX ||
    positionA.coords?.pageY !== positionB.coords?.pageY ||
    positionA.coords?.screenX !== positionB.coords?.screenX ||
    positionA.coords?.screenY !== positionB.coords?.screenY ||
    positionA.caret?.node !== positionB.caret?.node ||
    positionA.caret?.offset !== positionB.caret?.offset
  )
}
