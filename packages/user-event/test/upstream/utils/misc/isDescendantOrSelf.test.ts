// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/misc/isDescendantOrSelf.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {setup} from '#testHelpers'
import {isDescendantOrSelf} from '#src/utils/index.ts'

test('isDescendantOrSelf', async () => {
  setup(`<div><p><span></span><a></a></p></div>`)

  expect(
    isDescendantOrSelf(
      document.querySelector('span') as Element,
      document.querySelector('a') as Element,
    ),
  ).toBe(false)
  expect(
    isDescendantOrSelf(
      document.querySelector('span') as Element,
      document.querySelector('div') as Element,
    ),
  ).toBe(true)
  expect(
    isDescendantOrSelf(
      document.querySelector('span') as Element,
      document.querySelector('span') as Element,
    ),
  ).toBe(true)
})
