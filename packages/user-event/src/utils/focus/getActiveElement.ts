// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/focus/getActiveElement.ts

import type {
  Document,
  Element,
  HTMLIFrameElement,
  ShadowRoot,
} from '../../dom-types.ts'
import {isDisabled} from '../misc/isDisabled.ts'
import {isElementType} from '../misc/isElementType.ts'

export function getActiveElement(
  document: Document | ShadowRoot,
): Element | null {
  const activeElement = document.activeElement

  if (activeElement?.shadowRoot) {
    const activeElementInShadowTree = getActiveElement(activeElement.shadowRoot)
    if (activeElementInShadowTree) {
      return activeElementInShadowTree
    }
  } else if (activeElement && isElementType(activeElement, 'iframe')) {
    const contentDocument = (activeElement as HTMLIFrameElement).contentDocument
    if (contentDocument) {
      return getActiveElement(contentDocument)
    }
  }
  // Browser does not yield disabled elements as document.activeElement - jsdom does
  if (isDisabled(activeElement)) {
    return document.ownerDocument
      ? // TODO: verify behavior in ShadowRoot
        /* istanbul ignore next */ document.ownerDocument.body
      : (document as Document).body
  }

  return activeElement
}

export function getActiveElementOrBody(document: Document): Element {
  return getActiveElement(document) ?? /* istanbul ignore next */ document.body
}
