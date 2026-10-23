// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/behavior/registry.ts

import type {DocumentEventMap, Element} from '../../dom-types.ts'
import {type Instance} from '../../setup/index.ts'
import {type EventType} from '../types.ts'

export interface BehaviorPlugin<Type extends EventType> {
  (
    event: DocumentEventMap[Type],
    target: Element,
    instance: Instance,
  ):
  void | (() => void)
}

export const behavior: {
  [Type in EventType]?: BehaviorPlugin<Type>
} = {}
