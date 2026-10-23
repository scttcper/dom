// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/isDescendantOrSelf.ts

import type {Element} from '../../dom-types.ts'
export function isDescendantOrSelf(
  potentialDescendant: Element,
  potentialAncestor: Element,
) {
  let el: Element | null = potentialDescendant

  do {
    if (el === potentialAncestor) {
      return true
    }
    el = el.parentElement
  } while (el)

  return false
}
