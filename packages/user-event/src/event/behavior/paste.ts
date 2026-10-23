// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/behavior/paste.ts

import {isEditable} from '../../utils/index.ts'
import {input} from '../input.ts'
import {behavior} from './registry.ts'

behavior.paste = (event, target, instance) => {
  if (isEditable(target)) {
    return () => {
      const insertData = event.clipboardData?.getData('text')
      if (insertData) {
        input(instance, target, insertData, 'insertFromPaste')
      }
    }
  }
}
