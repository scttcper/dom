// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/updateSelectionOnFocus.ts

import type {Document, Element, Selection} from '../../dom-types.ts'
import {getContentEditable, hasOwnSelection} from '../../utils/index.ts'

// The browser implementation seems to have changed.
// When focus is inside <input type="text"/>,
// Chrome updates Selection to be collapsed at the position of the input element.
// TODO: update implementation to match that of current browsers

/**
 * Reset the Document Selection when moving focus into an element
 * with own selection implementation.
 */
export function updateSelectionOnFocus(element: Element) {
  const selection = element.ownerDocument.getSelection()

  /* istanbul ignore if */
  if (!selection?.focusNode) {
    return
  }

  // If the focus moves inside an element with own selection implementation,
  // the document selection will be this element.
  // But if the focused element is inside a contenteditable,
  // 1) a collapsed selection will be retained.
  // 2) other selections will be replaced by a cursor
  //  2.a) at the start of the first child if it is a text node
  //  2.b) at the start of the contenteditable.
  if (hasOwnSelection(element)) {
    const contenteditable = getContentEditable(selection.focusNode)
    if (contenteditable) {
      if (!selection.isCollapsed) {
        const focusNode =
          contenteditable.firstChild?.nodeType === 3
            ? contenteditable.firstChild
            : contenteditable
        selection.setBaseAndExtent(focusNode, 0, focusNode, 0)
      }
    } else {
      selection.setBaseAndExtent(element, 0, element, 0)
    }
  }
}
