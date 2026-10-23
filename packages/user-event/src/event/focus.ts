// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/focus.ts

import type {Element, HTMLElement} from '../dom-types.ts'
import {findClosest, getActiveElement, isFocusable} from '../utils/index.ts'
import {updateSelectionOnFocus} from './selection/index.ts'
import {wrapEvent} from './wrapEvent.ts'

// Browsers do not dispatch FocusEvent if the document does not have focus.
// TODO: simulate FocusEvent in browsers

/**
 * Focus closest focusable element.
 */
export function focusElement(element: Element) {
  const target = findClosest(element, isFocusable)

  const activeElement = getActiveElement(element.ownerDocument)
  if ((target ?? element.ownerDocument.body) === activeElement) {
    return
  } else if (target) {
    wrapEvent(() => target.focus(), element)
  } else {
    wrapEvent(() => (activeElement as HTMLElement | null)?.blur(), element)
  }

  updateSelectionOnFocus(target ?? element.ownerDocument.body)
}

export function blurElement(element: Element) {
  if (!isFocusable(element)) return

  const wasActive = getActiveElement(element.ownerDocument) === element
  if (!wasActive) return

  wrapEvent(() => element.blur(), element)
}
