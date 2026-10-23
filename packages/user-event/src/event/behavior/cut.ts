// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/behavior/cut.ts

import {isEditable} from '../../utils/index.ts'
import {input} from '../input.ts'
import {behavior} from './registry.ts'

behavior.cut = (event, target, instance) => {
  return () => {
    if (isEditable(target)) {
      input(instance, target, '', 'deleteByCut')
    }
  }
}
