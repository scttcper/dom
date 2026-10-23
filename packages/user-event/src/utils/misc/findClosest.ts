// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/findClosest.ts

import type {Element} from '../../dom-types.ts'
export function findClosest<T extends Element>(
  element: Element,
  callback: (e: Element) => e is T,
): T | undefined {
  let el: Element | null = element
  do {
    if (callback(el)) {
      return el
    }
    el = el.parentElement
  } while (el && el !== element.ownerDocument.body)
  return undefined
}
