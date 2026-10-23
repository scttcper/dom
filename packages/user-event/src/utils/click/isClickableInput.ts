// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/click/isClickableInput.ts

import type {Element, HTMLButtonElement, HTMLInputElement} from '../../dom-types.ts'
import {isElementType} from '../misc/isElementType.ts'

const clickableInputTypes = {
  button: 'button',
  color: 'color',
  file: 'file',
  image: 'image',
  reset: 'reset',
  submit: 'submit',
  checkbox: 'checkbox',
  radio: 'radio',
} as const
type clickableInputTypes = keyof typeof clickableInputTypes

export type ClickableInputOrButton =
  | HTMLButtonElement
  | (HTMLInputElement & {type: clickableInputTypes})

export function isClickableInput(
  element: Element,
): element is ClickableInputOrButton {
  return (
    isElementType(element, 'button') ||
    (isElementType(element, 'input') && element.type in clickableInputTypes)
  )
}
