// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/isVisible.ts

import {
  computedVisibility,
  getComputedStyleOverride,
  isDisplayNone,
  type NodeImpl,
} from '@ctrl/dom/internal'
import {implOf} from '../../ctrl-dom.ts'
import type {Element} from '../../dom-types.ts'
import {getWindow} from './getWindow.ts'

export function isVisible(element: Element): boolean {
  const window = getWindow(element)
  const impl = implOf(element)
  if (
    impl &&
    typeof window.getComputedStyle === 'function' &&
    getComputedStyleOverride(impl) === null
  ) {
    // Like upstream, a hidden ancestor disqualifies a visible descendant.
    for (let el: NodeImpl | null = impl; el?.type === 1; el = el.parent) {
      if (isDisplayNone(el) || computedVisibility(el) === 'hidden') return false
    }
    return true
  }

  for (
    let el: Element | null = element;
    el?.ownerDocument;
    el = el.parentElement
  ) {
    const {display, visibility} = window.getComputedStyle(el)
    if (display === 'none') {
      return false
    }
    if (visibility === 'hidden') {
      return false
    }
  }

  return true
}
