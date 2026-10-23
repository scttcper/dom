// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/setSelectionRange.ts

import type {Element} from '../../dom-types.ts'
import {hasOwnSelection, isContentEditable} from '../../utils/index.ts'
import {setSelection} from './setSelection.ts'

/**
 * Backward-compatible selection.
 *
 * Handles input elements and contenteditable if it only contains a single text node.
 */
export function setSelectionRange(
  element: Element,
  anchorOffset: number,
  focusOffset: number,
) {
  if (hasOwnSelection(element)) {
    return setSelection({
      focusNode: element,
      anchorOffset,
      focusOffset,
    })
  }

  /* istanbul ignore else */
  if (isContentEditable(element) && element.firstChild?.nodeType === 3) {
    return setSelection({
      focusNode: element.firstChild,
      anchorOffset,
      focusOffset,
    })
  }

  /* istanbul ignore next */
  throw new Error(
    'Not implemented. The result of this interaction is unreliable.',
  )
}
