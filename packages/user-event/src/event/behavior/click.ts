// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/behavior/click.ts

import {
  cloneEvent,
  getWindow,
  isElementType,
  isFocusable,
} from '../../utils/index.ts'
import {blurElement, focusElement} from '../focus.ts'
import {behavior} from './registry.ts'

behavior.click = (event, target, instance) => {
  const context = target.closest('button,input,label,select,textarea')
  const control = context && isElementType(context, 'label') && context.control
  if (control && control !== target) {
    return () => {
      if (isFocusable(control)) {
        focusElement(control)
        instance.dispatchEvent(control, cloneEvent(event))
      }
    }
  } else if (isElementType(target, 'input', {type: 'file'})) {
    return () => {
      // blur fires when the file selector pops up
      blurElement(target)

      target.dispatchEvent(new (getWindow(target).Event)('fileDialog'))

      // focus fires after the file selector has been closed
      focusElement(target)
    }
  }
}
