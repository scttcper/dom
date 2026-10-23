// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/isDisabled.ts

import type {Element} from '../../dom-types.ts'
import {isElementType} from './isElementType.ts'

// Hoisted: upstream builds this array for every ancestor of every event target.
const DISABLEABLE: ('button' | 'input' | 'select' | 'textarea' | 'optgroup' | 'option')[] = [
  'button',
  'input',
  'select',
  'textarea',
  'optgroup',
  'option',
]

// This should probably just rely on the :disabled pseudo-class, but JSDOM doesn't implement it properly.
export function isDisabled(element: Element | null): boolean {
  for (let el = element; el; el = el.parentElement) {
    if (isElementType(el, DISABLEABLE)) {
      if (el.hasAttribute('disabled')) {
        return true
      }
    } else if (isElementType(el, 'fieldset')) {
      if (
        el.hasAttribute('disabled') &&
        !el.querySelector(':scope > legend')?.contains(element)
      ) {
        return true
      }
    } else if (el.tagName.includes('-')) {
      if (
        (el.constructor as {formAssociated?: boolean}).formAssociated &&
        el.hasAttribute('disabled')
      ) {
        return true
      }
    }
  }

  return false
}
