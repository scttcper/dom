// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/getInputRange.ts

import type {Node, Range} from '../../dom-types.ts'
import {type UISelectionRange} from '../../document/index.ts'
import {getTargetTypeAndSelection} from './getTargetTypeAndSelection.ts'

/**
 * Get the range that would be overwritten by input.
 */
export function getInputRange(
  focusNode: Node,
): UISelectionRange | Range | undefined {
  const typeAndSelection = getTargetTypeAndSelection(focusNode)

  if (typeAndSelection.type === 'input') {
    return typeAndSelection.selection
  } else if (typeAndSelection.type === 'contenteditable') {
    // Multi-range on contenteditable edits the first selection instead of the last
    return typeAndSelection.selection?.getRangeAt(0)
  }
}
