// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/getTreeDiff.ts

import type {Element} from '../../dom-types.ts'
export function getTreeDiff(a: Element | null, b: Element | null) {
  const leave: Element[] = []
  const enter: Element[] = []
  // Paths at the same depth meet without visiting ancestors above their common parent.
  while (a !== b) {
    if (a) {
      leave.push(a)
      a = a.parentElement
    }
    if (b) {
      enter.push(b)
      b = b.parentElement
    }
  }
  // Different depths reach the root at different times. Trim any common ancestors from the ends.
  let common = a
  while (
    leave.length &&
    enter.length &&
    leave[leave.length - 1] === enter[enter.length - 1]
  ) {
    common = leave.pop()!
    enter.pop()
  }
  return [leave, enter, common] as const
}
