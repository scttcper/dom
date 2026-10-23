// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/moveSelection.ts

import type {Element} from '../../dom-types.ts'
import {getUISelection} from '../../document/index.ts'
import {getNextCursorPosition, hasOwnSelection} from '../../utils/index.ts'
import {setSelection} from './setSelection.ts'

/**
 * Move the selection
 */
export function moveSelection(node: Element, direction: -1 | 1) {
  // TODO: implement shift

  if (hasOwnSelection(node)) {
    const selection = getUISelection(node)

    setSelection({
      focusNode: node,
      focusOffset:
        selection.startOffset === selection.endOffset
          ? selection.focusOffset + direction
          : direction < 0
            ? selection.startOffset
            : selection.endOffset,
    })
  } else {
    const selection = node.ownerDocument.getSelection()

    if (!selection?.focusNode) {
      return
    }

    if (selection.isCollapsed) {
      const nextPosition = getNextCursorPosition(
        selection.focusNode,
        selection.focusOffset,
        direction,
      )
      if (nextPosition) {
        setSelection({
          focusNode: nextPosition.node,
          focusOffset: nextPosition.offset,
        })
      }
    } else {
      selection[direction < 0 ? 'collapseToStart' : 'collapseToEnd']()
    }
  }
}
