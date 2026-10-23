// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utility/clear.ts

import type {Element} from '../dom-types.ts'
import {focusElement, input, isAllSelected, selectAll} from '../event/index.ts'
import {type Instance} from '../setup/index.ts'
import {isDisabled, isEditable} from '../utils/index.ts'

export async function clear(this: Instance, element: Element) {
  if (!isEditable(element) || isDisabled(element)) {
    throw new Error('clear()` is only supported on editable elements.')
  }

  focusElement(element)

  if (element.ownerDocument.activeElement !== element) {
    throw new Error('The element to be cleared could not be focused.')
  }

  selectAll(element)

  if (!isAllSelected(element)) {
    throw new Error('The element content to be cleared could not be selected.')
  }

  input(this, element, '', 'deleteContentBackward')
}
