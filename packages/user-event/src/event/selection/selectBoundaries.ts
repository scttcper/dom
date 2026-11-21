// Not in upstream: what `selection.removeAllRanges(); selection.addRange(range)` does for a
// range with these boundary points, without the range.
//
// Upstream's mouse selection makes a live range (or a clone of one) for every press and every
// pointer move and hands it to the selection, which drops it at the next. A live range has to be
// kept up to date by every DOM mutation until it is collected, so each one made the mutations
// after it slower (@ctrl/dom's src/traversal/live.ts). Selection.setBaseAndExtent() gives the
// same selection: the anchor is the start and the focus the end, a range's start never follows
// its end, and both leave the direction forwards.

import type {Document, Node} from '../../dom-types.ts'

export function selectBoundaries(
  document: Document,
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number,
) {
  const selection = document.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  if (startNode.getRootNode() === document) {
    selection.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
  } else {
    // In a shadow tree or outside the document addRange() ignores the range
    // (https://w3c.github.io/selection-api/#dom-selection-addrange); keep that to the DOM.
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    selection.addRange(range)
  }
}
