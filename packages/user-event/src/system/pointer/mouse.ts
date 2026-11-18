// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/system/pointer/mouse.ts

import type {Element, MouseEventInit, Range} from '../../dom-types.ts'
import {
  type EventType,
  focusElement,
  modifySelectionPerMouseMove,
  type SelectionRange,
  setSelectionPerMouseDown,
} from '../../event/index.ts'
import {type Instance} from '../../setup/index.ts'
import {getTreeDiff, isDisabled} from '../../utils/index.ts'
import {Buttons, getMouseEventButton, MouseButton} from './buttons.ts'
import {
  isDifferentPointerPosition,
  type pointerKey,
  PointerLocation,
} from './shared.ts'

/**
 * This object is the single "virtual" mouse that might be controlled by multiple different pointer devices.
 */
// Ours: a module-level class (upstream defines it inline, a new class per instance).
class ClickCount {
  private down: Record<number, number | undefined> = {}
  private count: Record<number, number | undefined> = {}

  incOnClick(button: number) {
    const current =
      this.down[button] === undefined
        ? undefined
        : Number(this.down[button]) + 1

    this.count =
      this.count[button] === undefined
        ? {}
        : {[button]: Number(this.count[button]) + 1}

    return current
  }

  getOnDown(button: number) {
    this.down = {[button]: this.count[button] ?? 0}
    this.count = {[button]: this.count[button] ?? 0}

    return Number(this.count[button]) + 1
  }

  getOnUp(button: number) {
    return this.down[button] === undefined
      ? undefined
      : Number(this.down[button]) + 1
  }

  reset() {
    this.count = {}
  }
}

export class Mouse {
  position = new PointerLocation({})
  private readonly buttons = new Buttons()
  private selecting?: WeakRef<Element>
  private selections?: WeakMap<Element, Range | SelectionRange>
  private buttonDownTarget: Record<number, WeakRef<Element>> = {}

  // According to spec the `detail` on click events should be the number
  // of *consecutive* clicks with a specific button.
  // On `mousedown` and `mouseup` it should be this number increased by one.
  // But the browsers don't implement it this way.
  // If another button is pressed,
  //   in Webkit: the `mouseup` on the previously pressed button has `detail: 0` and no `click`/`auxclick`.
  //   in Gecko: the `mouseup` and click events have the same detail as the `mousedown`.
  // If there is a delay while a button is pressed,
  // the `mouseup` and `click` are normal, but a following `mousedown` starts a new click count.
  // We'll follow the minimal implementation of Webkit.
  private readonly clickCount = new ClickCount()

  move(
    instance: Instance,
    position: PointerLocation,
    /** Whether `preventDefault()` has been called on the `pointerdown` event */
    isPrevented: boolean,
  ) {
    const prevPosition = this.position
    const prevTarget = this.getTarget(instance)

    this.position = position

    if (!isDifferentPointerPosition(prevPosition, position)) {
      return
    }

    const nextTarget = this.getTarget(instance)

    const init = this.getEventInit('mousemove')

    const [leave, enter] = getTreeDiff(prevTarget, nextTarget)

    return {
      leave: () => {
        if (prevTarget !== nextTarget) {
          instance.dispatchUIEvent(prevTarget, 'mouseout', init)
          leave.forEach(el => instance.dispatchUIEvent(el, 'mouseleave', init))
        }
      },
      enter: () => {
        if (prevTarget !== nextTarget) {
          instance.dispatchUIEvent(nextTarget, 'mouseover', init)
          enter.forEach(el => instance.dispatchUIEvent(el, 'mouseenter', init))
        }
      },
      move: () => {
        if (isPrevented) {
          return
        }

        instance.dispatchUIEvent(nextTarget, 'mousemove', init)

        this.modifySelecting(instance)
      },
    }
  }

  down(
    instance: Instance,
    keyDef: pointerKey,
    /** Whether `preventDefault()` has been called on the `pointerdown` event */
    isPrevented: boolean,
  ) {
    const button = this.buttons.down(keyDef)

    if (button === undefined) {
      return
    }

    const positionedTarget = this.position.target
    const target = positionedTarget ?? instance.config.document.body
    const downTarget = positionedTarget
      ? this.position.targetRef!
      : new WeakRef(target)
    this.buttonDownTarget[button] = downTarget
    const init = this.getEventInit('mousedown', keyDef.button)
    const disabled = isDisabled(target)
    if (
      !isPrevented &&
      (disabled || instance.dispatchUIEvent(target, 'mousedown', init))
    ) {
      this.startSelecting(instance, init.detail as number, target, downTarget)
      focusElement(target)
    }
    if (!disabled && getMouseEventButton(keyDef.button) === 2) {
      instance.dispatchUIEvent(
        target,
        'contextmenu',
        this.getEventInit('contextmenu', keyDef.button),
      )
    }
  }

  up(
    instance: Instance,
    keyDef: pointerKey,
    /** Whether `preventDefault()` has been called on the `pointerdown` event */
    isPrevented: boolean,
  ) {
    const button = this.buttons.up(keyDef)

    if (button === undefined) {
      return
    }
    const downTarget = this.buttonDownTarget[button].deref() ?? null
    delete this.buttonDownTarget[button]
    const target = this.getTarget(instance)
    const disabled = isDisabled(target)
    if (!disabled && !isPrevented) {
      const mouseUpInit = this.getEventInit('mouseup', keyDef.button)
      instance.dispatchUIEvent(target, 'mouseup', mouseUpInit)
    }
    this.endSelecting()

    if (!disabled) {
      const clickTarget =
        downTarget === target
          ? target
          : downTarget && getTreeDiff(downTarget, target)[2]
      if (clickTarget) {
        const init = this.getEventInit('click', keyDef.button)
        if (init.detail) {
          instance.dispatchUIEvent(
            clickTarget,
            init.button === 0 ? 'click' : 'auxclick',
            init,
          )
          if (init.button === 0 && init.detail === 2) {
            instance.dispatchUIEvent(clickTarget, 'dblclick', {
              ...this.getEventInit('dblclick', keyDef.button),
              detail: init.detail,
            })
          }
        }
      }
    }
  }

  resetClickCount() {
    this.clickCount.reset()
  }

  private getEventInit(type: EventType, button?: MouseButton) {
    const init: MouseEventInit = {
      ...this.position.coords,
    }

    init.button = getMouseEventButton(button)
    init.buttons = this.buttons.getButtons()

    if (type === 'mousedown') {
      init.detail = this.clickCount.getOnDown(init.button)
    } else if (type === 'mouseup') {
      init.detail = this.clickCount.getOnUp(init.button)
    } else if (type === 'click' || type === 'auxclick') {
      init.detail = this.clickCount.incOnClick(init.button)
    }

    return init
  }

  private getTarget(instance: Instance) {
    return this.position.target ?? instance.config.document.body
  }

  private startSelecting(
    instance: Instance,
    clickCount: number,
    target: Element,
    targetRef: WeakRef<Element>,
  ) {
    // TODO: support extending range (shift)

    const selection = setSelectionPerMouseDown({
      document: instance.config.document,
      target,
      node: this.position.caret?.node,
      offset: this.position.caret?.offset,
      clickCount,
    })
    this.endSelecting()
    if (selection) {
      // Keep the live drag anchor as long as its target exists. An input selection itself
      // points back to the input, so a strong field would keep a removed subtree alive.
      this.selections ??= new WeakMap()
      this.selections.set(target, selection)
      this.selecting = targetRef
    }
  }

  private modifySelecting(instance: Instance) {
    const target = this.selecting?.deref()
    const selection = target && this.selections?.get(target)
    if (!selection) {
      return
    }
    modifySelectionPerMouseMove(selection, {
      document: instance.config.document,
      target: this.getTarget(instance),
      node: this.position.caret?.node,
      offset: this.position.caret?.offset,
    })
  }

  private endSelecting() {
    const target = this.selecting?.deref()
    if (target) this.selections?.delete(target)
    this.selecting = undefined
  }
}
