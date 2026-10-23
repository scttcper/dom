// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/getTargetTypeAndSelection.ts

import type {Element, Node} from '../../dom-types.ts'
import {getUISelection} from '../../document/index.ts'
import {getContentEditable, hasOwnSelection} from '../../utils/index.ts'

/**
 * Determine which selection logic and selection ranges to consider.
 */
export function getTargetTypeAndSelection(node: Node) {
  const element = getElement(node)

  if (element && hasOwnSelection(element)) {
    return {
      type: 'input',
      selection: getUISelection(element),
    } as const
  }

  const selection = element?.ownerDocument.getSelection()

  // It is possible to extend a single-range selection into a contenteditable.
  // This results in the range acting like a range outside of contenteditable.
  const isCE =
    getContentEditable(node) &&
    selection?.anchorNode &&
    getContentEditable(selection.anchorNode)

  return {
    type: isCE ? 'contenteditable' : 'default',
    selection,
  } as const
}

function getElement(node: Node) {
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}
