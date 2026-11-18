// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/resolveCaretPosition.ts

import type {Element, Node} from '../../dom-types.ts'
import {getUIValue} from '../../document/index.ts'
import {hasOwnSelection} from '../../utils/index.ts'

export function resolveCaretPosition({
  target,
  node,
  offset,
}: {
  target: Element
  node?: Node
  offset?: number
}) {
  if (hasOwnSelection(target)) {
    return {
      node: target,
      offset: offset ?? getUIValue(target).length,
    }
  } else if (node) {
    return {
      node,
      offset:
        offset ??
        (node.nodeType === 3
          ? (node.nodeValue as string).length
          : node.childNodes.length),
    }
  }

  // The usual click lands after the last character. Follow the last child directly when
  // that path ends in text, without materializing live childNodes lists or joining subtree text.
  if (offset === undefined) {
    let end: Node = target
    while (end.nodeType === 1) {
      const child = end.lastChild
      if (!child) {
        if (end === target) return {node: target, offset: 0}
        break
      }
      end = child
    }
    if (end.nodeType === 3 && end.nodeValue)
      return {node: end, offset: end.nodeValue.length}
  }

  return findNodeAtTextOffset(target, offset)
}

function findNodeAtTextOffset(
  node: Node,
  offset: number | undefined,
  isRoot = true,
): {
  node: Node
  offset: number
} {
  // When clicking after the content the browser behavior can be complicated:
  // 1. If there is textContent after the last element child,
  // the cursor is moved there.
  // 2. If there is textContent in the last element child,
  // the browser moves the cursor to the last non-empty text node inside this element.
  // 3. Otherwise the cursor is moved to the end of the target.

  let i = offset === undefined ? node.childNodes.length - 1 : 0
  const step = offset === undefined ? -1 : +1

  while (
    offset === undefined
      ? i >= (isRoot ? Math.max(node.childNodes.length - 1, 0) : 0)
      : i <= node.childNodes.length
  ) {
    if (offset && i === node.childNodes.length) {
      throw new Error('The given offset is out of bounds.')
    }
    const c = node.childNodes.item(i)

    const text = String(c.textContent)
    if (text.length) {
      if (offset !== undefined && text.length < offset) {
        offset -= text.length
      } else if (c.nodeType === 1) {
        return findNodeAtTextOffset(c as Element, offset, false)
      } else {
        // The pre-commit hooks keeps changing this
        // See https://github.com/kentcdodds/kcd-scripts/issues/218
        /* istanbul ignore else */

        if (c.nodeType === 3) {
          return {
            node: c as Node,
            offset: offset ?? (c.nodeValue as string).length,
          }
        }
      }
    }

    i += step
  }

  return {node, offset: node.childNodes.length}
}
