// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/edit/isContentEditable.ts

import type {Element, HTMLElement, Node} from '../../dom-types.ts'
// jsdom is not supporting isContentEditable
export function isContentEditable(
  element: Element,
): element is HTMLElement & {contenteditable: 'true'} {
  return (
    element.hasAttribute('contenteditable') &&
    (element.getAttribute('contenteditable') == 'true' ||
      element.getAttribute('contenteditable') == '')
  )
}

/**
 * If a node is a contenteditable or inside one, return that element.
 */
export function getContentEditable(node: Node): Element | null {
  const element = getElement(node)
  return (
    element &&
    (element.closest('[contenteditable=""]') ||
      element.closest('[contenteditable="true"]'))
  )
}

function getElement(node: Node) {
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}
