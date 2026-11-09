// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/isDisabled.ts

import type {NodeImpl} from '@ctrl/dom/internal'
import type {Element} from '../../dom-types.ts'
import {implAttr, implOf, TAGS} from '../../ctrl-dom.ts'
import {isElementType} from './isElementType.ts'

// Hoisted: upstream builds this array for every ancestor of every event target.
const DISABLEABLE: (
  | 'button'
  | 'input'
  | 'select'
  | 'textarea'
  | 'optgroup'
  | 'option'
)[] = ['button', 'input', 'select', 'textarea', 'optgroup', 'option']

// This should probably just rely on the :disabled pseudo-class, but JSDOM doesn't implement it properly.
export function isDisabled(element: Element | null): boolean {
  const impl = implOf(element)
  if (impl !== null && implAttr !== undefined && TAGS !== undefined) {
    return isDisabledImpl(impl, element as Element, implAttr, TAGS)
  }
  for (let el = element; el; el = el.parentElement) {
    if (disables(el, element as Element)) return true
  }

  return false
}

/** Upstream's loop body: whether `el`, an inclusive ancestor of `element`, disables it. */
function disables(el: Element, element: Element): boolean {
  if (isElementType(el, DISABLEABLE)) {
    if (el.hasAttribute('disabled')) {
      return true
    }
  } else if (isElementType(el, 'fieldset')) {
    if (
      el.hasAttribute('disabled') &&
      !el.querySelector(':scope > legend')?.contains(element)
    ) {
      return true
    }
  } else if (el.tagName.includes('-')) {
    if (
      (el.constructor as {formAssociated?: boolean}).formAssociated &&
      el.hasAttribute('disabled')
    ) {
      return true
    }
  }
  return false
}

/**
 * The same climb over @ctrl/dom's node records. It runs for every event target, and on the
 * wrappers it reads `parentElement`, `tagName` and `hasAttribute` on each ancestor, a `<form>`'s
 * named-property Proxy included (its `get` trap alone was 2.3% of the CPU of a form test's
 * user-event calls). A known HTML tag without a prefix is settled by its tag id: the six
 * disableable tags, a fieldset (whose first `legend` child holds the element exactly when the
 * climb came through it), or nothing, since such a name has no "-". Any other element goes
 * through the loop body above.
 */
function isDisabledImpl(
  start: NodeImpl,
  element: Element,
  attr: (el: NodeImpl, lowerName: string) => string | null,
  T: Record<string, number>,
): boolean {
  let child: NodeImpl | null = null
  // `parentElement`: the climb ends at a parent that is not an element (document, shadow root).
  for (
    let el: NodeImpl | null = start;
    el !== null && el.type === 1;
    child = el, el = el.parent
  ) {
    const tag = el.tag
    if (tag === 0 || el.prefix !== null) {
      if (disables(el.node as unknown as Element, element)) return true
    } else if (
      tag === T.button ||
      tag === T.input ||
      tag === T.select ||
      tag === T.textarea ||
      tag === T.optgroup ||
      tag === T.option
    ) {
      if (attr(el, 'disabled') !== null) return true
    } else if (tag === T.fieldset) {
      if (attr(el, 'disabled') !== null && firstLegendChild(el) !== child) {
        return true
      }
    }
  }
  return false
}

/**
 * `fieldset.querySelector(':scope > legend')`. Without one it is undefined, which no `child` of
 * the climb equals: not even the null of a fieldset that is itself the element.
 */
function firstLegendChild(fieldset: NodeImpl): NodeImpl | undefined {
  for (let c = fieldset.first; c !== null; c = c.next) {
    if (c.type === 1 && c.name === 'legend') return c
  }
  return undefined
}
