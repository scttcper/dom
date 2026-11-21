// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/modifySelectionPerMouse.ts

import type {Document, Element, Node, Range} from '../../dom-types.ts'
import {setUISelection} from '../../document/index.ts'
import {type SelectionRange} from './index.ts'
import {resolveCaretPosition} from './resolveCaretPosition.ts'
import {selectBoundaries} from './selectBoundaries.ts'

export function modifySelectionPerMouseMove(
  selectionRange: Range | SelectionRange,
  {
    document,
    target,
    node,
    offset,
  }: {
    document: Document
    target: Element
    node?: Node
    offset?: number
  },
) {
  const selectionFocus = resolveCaretPosition({target, node, offset})

  if ('node' in selectionRange) {
    // When the mouse is dragged outside of an input/textarea,
    // the selection is extended to the beginning or end of the input
    // depending on pointer position.
    // TODO: extend selection according to pointer position
    /* istanbul ignore else */
    if (selectionFocus.node === selectionRange.node) {
      const anchorOffset =
        selectionFocus.offset < selectionRange.start
          ? selectionRange.end
          : selectionRange.start
      const focusOffset =
        selectionFocus.offset > selectionRange.end ||
        selectionFocus.offset < selectionRange.start
          ? selectionFocus.offset
          : selectionRange.end

      setUISelection(selectionRange.node, {anchorOffset, focusOffset})
    }
  } else {
    // Upstream clones the range, moves the clone's start or end to the pointer and adds the
    // clone to the selection. The boundary points it would have: a point before the range
    // becomes its start, one after it its end.
    let startNode = selectionRange.startContainer
    let startOffset = selectionRange.startOffset
    let endNode = selectionRange.endContainer
    let endOffset = selectionRange.endOffset
    const cmp = selectionRange.comparePoint(
      selectionFocus.node,
      selectionFocus.offset,
    )
    if (cmp < 0) {
      startNode = selectionFocus.node
      startOffset = selectionFocus.offset
    } else if (cmp > 0) {
      endNode = selectionFocus.node
      endOffset = selectionFocus.offset
    }
    selectBoundaries(document, startNode, startOffset, endNode, endOffset)
  }
}
