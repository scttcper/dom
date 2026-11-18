// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/pointer/index.ts

import type {Element, Node} from '../dom-types.ts'
import {type PointerCoords} from '../event/index.ts'
import {type Instance} from '../setup/index.ts'
import {type pointerKey, type PointerPosition} from '../system/pointer/index.ts'
import {PointerLocation} from '../system/pointer/shared.ts'
import {ApiLevel, setLevelRef, yieldBetweenActions} from '../utils/index.ts'
import {appendKeyActions} from './parseKeyDef.ts'

type PointerActionInput =
  | string
  | ({keys: string} & PointerActionPosition)
  | PointerAction
export type PointerInput = PointerActionInput | Array<PointerActionInput>

export type PointerAction = PointerPressAction | PointerMoveAction

type PointerActionPosition = {
  target?: Element
  coords?: PointerCoords
  node?: Node
  /**
   * If `node` is set, this is the DOM offset.
   * Otherwise this is the `textContent`/`value` offset on the `target`.
   */
  offset?: number
}

interface PointerPressAction extends PointerActionPosition {
  keyDef: pointerKey
  releasePrevious: boolean
  releaseSelf: boolean
}

interface PointerMoveAction extends PointerActionPosition {
  pointerName?: string
}

export function pointer(this: Instance, input: PointerInput): Promise<void> {
  try {
    return performActions(this, parseActions(this.config.pointerMap, input))
  } catch (error) {
    return Promise.reject(error)
  }
}

function parseActions(pointerMap: pointerKey[], input: PointerInput) {
  const actions: PointerAction[] = []
  ;(Array.isArray(input) ? input : [input]).forEach(actionInput => {
    if (typeof actionInput === 'string') {
      appendKeyActions(pointerMap, actionInput, actions)
    } else if ('keys' in actionInput) {
      const start = actions.length
      appendKeyActions(pointerMap, actionInput.keys, actions)
      for (let i = start; i < actions.length; i++) {
        actions[i] = {...actionInput, ...actions[i]}
      }
    } else {
      actions.push(actionInput)
    }
  })

  return actions
}

async function performActions(instance: Instance, actions: PointerAction[]) {
  // Pop completed actions so a pending delay only keeps future targets alive.
  actions.reverse()
  while (actions.length) {
    await yieldBetweenActions(instance.config)

    await pointerAction(instance, actions.pop()!)
  }

  instance.system.pointer.resetClickCount()
}

async function pointerAction(instance: Instance, action: PointerAction) {
  const pointerName =
    'pointerName' in action && action.pointerName
      ? action.pointerName
      : 'keyDef' in action
        ? instance.system.pointer.getPointerName(action.keyDef)
        : 'mouse'

  const previousPosition =
    instance.system.pointer.getPreviousPosition(pointerName)
  const position = new PointerLocation(
    {
      target: action.target ?? getPrevTarget(instance, previousPosition),
      coords: action.coords ?? previousPosition?.coords,
      caret: {
        node:
          action.node ??
          (hasCaretPosition(action)
            ? undefined
            : previousPosition?.caret?.node),
        offset:
          action.offset ??
          (hasCaretPosition(action)
            ? undefined
            : previousPosition?.caret?.offset),
      },
    },
    previousPosition,
  )

  if ('keyDef' in action) {
    if (instance.system.pointer.isKeyPressed(action.keyDef)) {
      setLevelRef(instance, ApiLevel.Trigger)
      await instance.system.pointer.release(instance, action.keyDef, position)
    }

    if (!action.releasePrevious) {
      setLevelRef(instance, ApiLevel.Trigger)
      await instance.system.pointer.press(instance, action.keyDef, position)

      if (action.releaseSelf) {
        setLevelRef(instance, ApiLevel.Trigger)
        await instance.system.pointer.release(instance, action.keyDef, position)
      }
    }
  } else {
    setLevelRef(instance, ApiLevel.Trigger)
    await instance.system.pointer.move(instance, pointerName, position)
  }
}

function hasCaretPosition(action: PointerAction) {
  return !!(action.target ?? action.node ?? action.offset !== undefined)
}

function getPrevTarget(instance: Instance, position?: PointerPosition) {
  if (!position) {
    throw new Error(
      'This pointer has no previous position. Provide a target property!',
    )
  }

  return position.target ?? instance.config.document.body
}
