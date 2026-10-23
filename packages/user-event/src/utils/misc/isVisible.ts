// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/isVisible.ts

import type {Element} from '../../dom-types.ts'
import {getWindow} from './getWindow.ts'

export function isVisible(element: Element): boolean {
  const window = getWindow(element)

  for (
    let el: Element | null = element;
    el?.ownerDocument;
    el = el.parentElement
  ) {
    const {display, visibility} = window.getComputedStyle(el)
    if (display === 'none') {
      return false
    }
    if (visibility === 'hidden') {
      return false
    }
  }

  return true
}
