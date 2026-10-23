// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/behavior/keyup.ts

import {isClickableInput} from '../../utils/index.ts'
import {type BehaviorPlugin} from './index.ts'
import {behavior} from './registry.ts'

behavior.keyup = (event, target, instance) => {
  return keyupBehavior[event.key]?.(event, target, instance)
}

const keyupBehavior: {
  [key: string]: BehaviorPlugin<'keyup'> | undefined
} = {
  ' ': (event, target, instance) => {
    if (isClickableInput(target)) {
      return () => instance.dispatchUIEvent(target, 'click')
    }
  },
}
