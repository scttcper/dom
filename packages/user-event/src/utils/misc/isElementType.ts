// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/isElementType.ts

import type {Element, HTMLElementTagNameMap} from '../../dom-types.ts'
type tag = keyof HTMLElementTagNameMap

const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const UPPERCASE = /[A-Z]/

/**
 * `element.tagName.toLowerCase()` without allocating a string per call: the tag name is the
 * (in HTML documents uppercased) qualified name, which lowercases to `localName` unless the
 * element has a prefix or a mixed-case local name.
 */
function lowerTagName(element: Element): string {
  const localName = element.localName
  if (element.prefix == null && typeof localName === 'string' && !UPPERCASE.test(localName)) {
    return localName
  }
  return element.tagName.toLowerCase()
}

// Upstream wraps `tag` in an array and compares `Object.entries(props)` on every call; this is
// called for every ancestor of every event target (isDisabled, pointer-events checks), so it
// avoids allocating. Same results.
export function isElementType<
  T extends tag,
  P extends {[k: string]: unknown} | undefined = undefined,
>(
  element: Element,
  tag: T | T[],
  props?: P,
): element is P extends undefined
  ? HTMLElementTagNameMap[T]
  : HTMLElementTagNameMap[T] & P {
  if (element.namespaceURI && element.namespaceURI !== XHTML_NS) {
    return false
  }

  // tagName is uppercase in HTMLDocument and lowercase in XMLDocument
  const name = lowerTagName(element)
  if (typeof tag === 'string' ? name !== tag : !tag.includes(name as T)) {
    return false
  }

  if (props) {
    for (const k in props) {
      if (Object.hasOwn(props, k) && element[k as keyof Element] !== props[k]) {
        return false
      }
    }
  }

  return true
}
