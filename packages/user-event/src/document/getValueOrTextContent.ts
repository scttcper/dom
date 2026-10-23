// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/document/getValueOrTextContent.ts

import type {Element, HTMLInputElement, HTMLTextAreaElement} from '../dom-types.ts'
import {isContentEditable} from '../utils/index.ts'
import {getUIValue} from './UI.ts'

export function getValueOrTextContent<T extends Element | null>(
  element: T,
): T extends HTMLInputElement | HTMLTextAreaElement ? string : string | null
export function getValueOrTextContent(
  element: Element | null,
): string | null | undefined {
  // istanbul ignore if
  if (!element) {
    return null
  }
  if (isContentEditable(element)) {
    return element.textContent
  }
  return getUIValue(element as HTMLInputElement)
}
