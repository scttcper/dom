// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/edit/isEditable.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {isEditable} from '#src/utils/index.ts'
import {render} from '#testHelpers'

test.each([
  [`<input readonly value="foo"/>`],
  [`<input type="color" value="#ffffff" />`],
  [`<input type="image" value="foo" />`],
  [`<input type="button" value="foo"/>`],
  [`<input type="reset" value="foo" />`],
  [`<input type="submit" value="foo" />`],
  [`<input type="file" />`],
  [`<button value="foo" />`],
  [`<div tabIndex="-1"/>`],
  [`<div tabIndex="-1" contenteditable="false"/>`],
])('consider %s a non-editable element', html => {
  const {element} = render(html)

  expect(isEditable(element)).toBe(false)
})

test.each([
  [`<input/>`],
  [`<textarea></textarea>`],
  [`<div contenteditable></div>`],
  [`<div contenteditable="true"></div>`],
])('consider %s an editable element', html => {
  const {element} = render(html)

  expect(isEditable(element)).toBe(true)
})
