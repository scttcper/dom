// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/modifySelection.ts

import type {HTMLInputElement, Node} from '../../dom-types.ts'
import {setUISelection} from '../../document/index.ts'
import {getTargetTypeAndSelection} from './getTargetTypeAndSelection.ts'

/**
 * Extend/shrink the selection like with Shift+Arrows or Shift+Mouse
 */
export function modifySelection({
  focusNode,
  focusOffset,
}: {
  focusNode: Node
  /** DOM Offset */
  focusOffset: number
}) {
  const typeAndSelection = getTargetTypeAndSelection(focusNode)

  if (typeAndSelection.type === 'input') {
    return setUISelection(
      focusNode as HTMLInputElement,
      {
        anchorOffset: typeAndSelection.selection.anchorOffset,
        focusOffset,
      },
      'modify',
    )
  }

  focusNode.ownerDocument?.getSelection()?.extend(focusNode, focusOffset)
}
