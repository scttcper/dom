// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/event/createEvent.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {createEvent} from '#src/event/createEvent.ts'
import {render} from '#testHelpers'

test('it initializes pointerType to empty string by default', () => {
  const {element} = render(`<input type="checkbox"/>`)
  const event = createEvent('click', element)
  expect(event).toHaveProperty('pointerType', '')
})

test('it preserves explicitly provided pointerType', () => {
  const {element} = render(`<input type="checkbox"/>`)
  const event = createEvent('pointerdown', element, {pointerType: 'mouse'})
  expect(event).toHaveProperty('pointerType', 'mouse')
})
