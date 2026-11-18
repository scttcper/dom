// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/edit/isContentEditable.ts

import {attr, F_CONTENTEDITABLE_ATTR} from '@ctrl/dom/internal'
import {implOf} from '../../ctrl-dom.ts'
import type {Element, HTMLElement, Node} from '../../dom-types.ts'
// jsdom is not supporting isContentEditable
export function isContentEditable(
  element: Element,
): element is HTMLElement & {contenteditable: 'true'} {
  const value = element.getAttribute('contenteditable')
  return value === 'true' || value === ''
}

/**
 * If a node is a contenteditable or inside one, return that element.
 */
export function getContentEditable(node: Node): Element | null {
  const element = getElement(node)
  let impl = implOf(element)
  if (impl) {
    // Upstream prefers an empty attribute anywhere in the ancestor chain to the nearest "true".
    let nearestTrue: Element | null = null
    for (; impl !== null; impl = impl.parent) {
      if ((impl.flags & F_CONTENTEDITABLE_ATTR) === 0) continue
      const value = attr(impl, 'contenteditable')
      if (value === '') return impl.node as unknown as Element
      if (value === 'true' && nearestTrue === null) {
        nearestTrue = impl.node as unknown as Element
      }
    }
    return nearestTrue
  }
  return (
    element &&
    (element.closest('[contenteditable=""]') ||
      element.closest('[contenteditable="true"]'))
  )
}

function getElement(node: Node) {
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}
