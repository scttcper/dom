// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/edit/maxLength.ts

import type {Element, HTMLInputElement, HTMLTextAreaElement} from '../../dom-types.ts'
import {isElementType} from '../misc/isElementType.ts'

const maxLengthSupportedTypes = {
  email: 'email',
  password: 'password',
  search: 'search',
  telephone: 'telephone',
  text: 'text',
  url: 'url',
} as const
type maxLengthSupportedTypes = keyof typeof maxLengthSupportedTypes

type ElementWithMaxLengthSupport =
  | HTMLTextAreaElement
  | (HTMLInputElement & {type: maxLengthSupportedTypes})

// can't use .maxLength property because of a jsdom bug:
// https://github.com/jsdom/jsdom/issues/2927
export function getMaxLength(element: ElementWithMaxLengthSupport) {
  const attr = element.getAttribute('maxlength') ?? ''

  return /^\d+$/.test(attr) && Number(attr) >= 0 ? Number(attr) : undefined
}

export function supportsMaxLength(
  element: Element,
): element is ElementWithMaxLengthSupport {
  return (
    isElementType(element, 'textarea') ||
    (isElementType(element, 'input') && element.type in maxLengthSupportedTypes)
  )
}
