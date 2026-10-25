// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/focus/selection.ts

import type { Element, Node } from '../../dom-types.ts'
import {
  type ClickableInputOrButton,
  isClickableInput,
} from '../click/isClickableInput.ts'
import {
  type EditableInputOrTextarea,
  isEditableInputOrTextArea,
} from '../edit/isEditable.ts'

/**
 * Determine if the element has its own selection implementation
 * and does not interact with the Document Selection API.
 */
export function hasOwnSelection(node: Node): node is EditableInputOrTextarea {
  return isElement(node) && isEditableInputOrTextArea(node)
}

export function hasNoSelection(node: Node): node is ClickableInputOrButton {
  return isElement(node) && isClickableInput(node)
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}
