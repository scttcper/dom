// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/dispatchEvent.ts

import type {Element, Event} from '../dom-types.ts'
import {type Instance} from '../setup/index.ts'
import {type EventType, type EventTypeInit} from './types.ts'
import {behavior, type BehaviorPlugin} from './behavior/index.ts'
import {wrapEvent} from './wrapEvent.ts'
import {isKeyboardEvent, isMouseEvent} from './eventMap.ts'
import {createEvent} from './createEvent.ts'

export function dispatchUIEvent<K extends EventType>(
  this: Instance,
  target: Element,
  type: K,
  init?: EventTypeInit<K>,
  preventDefault: boolean = false,
) {
  if (isMouseEvent(type) || isKeyboardEvent(type)) {
    init = {
      ...init,
      ...this.system.getUIEventModifiers(),
    } as EventTypeInit<K>
  }

  const event = createEvent(type, target, init)

  return dispatchEvent.call(this, target, event, preventDefault)
}

export function dispatchEvent(
  this: Instance,
  target: Element,
  event: Event,
  preventDefault: boolean = false,
) {
  const type = event.type as EventType
  const behaviorImplementation = preventDefault
    ? () => {}
    : (behavior[type] as BehaviorPlugin<EventType> | undefined)?.(
        event,
        target,
        this,
      )

  if (behaviorImplementation) {
    event.preventDefault()
    let defaultPrevented = false
    Object.defineProperty(event, 'defaultPrevented', {
      get: () => defaultPrevented,
    })
    Object.defineProperty(event, 'preventDefault', {
      value: () => {
        defaultPrevented = event.cancelable
      },
    })

    wrapEvent(() => target.dispatchEvent(event), target)

    if (!defaultPrevented as boolean) {
      behaviorImplementation()
    }

    return !defaultPrevented
  }

  return wrapEvent(() => target.dispatchEvent(event), target)
}

export function dispatchDOMEvent<K extends EventType>(
  target: Element,
  type: K,
  init?: EventTypeInit<K>,
) {
  const event = createEvent(type, target, init)
  wrapEvent(() => target.dispatchEvent(event), target)
}
