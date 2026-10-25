// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/radio.ts

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
 * environment polyfills it for jsdom), otherwise https://drafts.csswg.org/cssom/#serialize-an-identifier.
 */
function cssEscape(
  window: {CSS?: {escape(ident: string): string}},
  ident: string,
): string {
  if (typeof window.CSS?.escape === 'function') {
    return window.CSS.escape(ident)
  }
  let out = ''
  for (let i = 0; i < ident.length; i++) {
    const c = ident.charCodeAt(i)
    if (c === 0) {
      out += '\uFFFD'
    } else if (
      (c >= 0x1 && c <= 0x1f) ||
      c === 0x7f ||
      (i === 0 && c >= 0x30 && c <= 0x39) ||
      (i === 1 && c >= 0x30 && c <= 0x39 && ident.charCodeAt(0) === 0x2d)
    ) {
      out += `\\${c.toString(16)} `
    } else if (i === 0 && c === 0x2d && ident.length === 1) {
      out += '\\-'
    } else if (
      c >= 0x80 ||
      c === 0x2d ||
      c === 0x5f ||
      (c >= 0x30 && c <= 0x39) ||
      (c >= 0x41 && c <= 0x5a) ||
      (c >= 0x61 && c <= 0x7a)
    ) {
      out += ident[i]
    } else {
      out += `\\${ident[i]}`
    }
  }
  return out
}
