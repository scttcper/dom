// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/setSelection.ts

import type {HTMLInputElement, Node} from '../../dom-types.ts'
import {setUISelection} from '../../document/index.ts'
import {getTargetTypeAndSelection} from './getTargetTypeAndSelection.ts'

/**
 * Set the selection
 */
export function setSelection({
  focusNode,
  focusOffset,
  anchorNode = focusNode,
  anchorOffset = focusOffset,
}: {
  anchorNode?: Node
  /** DOM offset */
  anchorOffset?: number
  focusNode: Node
  focusOffset: number
}) {
  const typeAndSelection = getTargetTypeAndSelection(focusNode)

  if (typeAndSelection.type === 'input') {
    return setUISelection(focusNode as HTMLInputElement, {
      anchorOffset,
      focusOffset,
    })
  }

  anchorNode.ownerDocument
    ?.getSelection()
    ?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
}
