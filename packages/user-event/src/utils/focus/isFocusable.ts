// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/focus/isFocusable.ts

import type {Element, HTMLElement} from '../../dom-types.ts'
import {FOCUSABLE_SELECTOR} from './selector.ts'

export function isFocusable(element: Element): element is HTMLElement {
  return element.matches(FOCUSABLE_SELECTOR)
}
