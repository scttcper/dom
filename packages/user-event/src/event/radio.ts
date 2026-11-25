// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/radio.ts

import {serializeIdentifier} from '@ctrl/dom/internal'
import type {HTMLInputElement} from '../dom-types.ts'
import {type Instance} from '../setup/index.ts'
import {getWindow, isDisabled} from '../utils/index.ts'
import {focusElement} from './focus.ts'

export function walkRadio(
  instance: Instance,
  el: HTMLInputElement & {type: 'radio'},
  direction: -1 | 1,
) {
  const window = getWindow(el)
  const group = Array.from(
    el.ownerDocument.querySelectorAll<HTMLInputElement & {type: 'radio'}>(
      el.name
        ? `input[type="radio"][name="${cssEscape(window, el.name)}"]`
        : `input[type="radio"][name=""], input[type="radio"]:not([name])`,
    ),
  )
  for (let i = group.findIndex(e => e === el) + direction; ; i += direction) {
    if (!group[i]) {
      i = direction > 0 ? 0 : group.length - 1
    }
    if (group[i] === el) {
      return
    }
    if (isDisabled(group[i])) {
      continue
    }

    focusElement(group[i])
    instance.dispatchUIEvent(group[i], 'click')
    return
  }
}

/**
 * `CSS.escape` when the window provides it (upstream relies on it unconditionally; its test
 * environment polyfills it for jsdom), otherwise @ctrl/dom's https://drafts.csswg.org/cssom/#serialize-an-identifier.
 */
function cssEscape(
  window: {CSS?: {escape(ident: string): string}},
  ident: string,
): string {
  return typeof window.CSS?.escape === 'function'
    ? window.CSS.escape(ident)
    : serializeIdentifier(ident)
}
