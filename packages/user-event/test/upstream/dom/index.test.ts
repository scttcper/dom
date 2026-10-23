// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/dom/index.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {setup} from '#testHelpers'

test('edit number input', async () => {
  const {element, user} = setup(`<input type="number" value="1"/>`)

  await user.type(
    element,
    'e-5[ArrowLeft][Delete]6[ArrowLeft][Backspace][Backspace]',
  )

  expect(element).toHaveValue(16)
})
