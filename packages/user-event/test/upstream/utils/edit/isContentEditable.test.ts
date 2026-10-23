// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/edit/isContentEditable.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {setup} from '#testHelpers'
import {isContentEditable} from '#src/utils/index.ts'

test('report if element is contenteditable', async () => {
  const {elements} = setup(
    `<div></div><div contenteditable="false"></div><div contenteditable></div><div contenteditable="true"></div>`,
  )

  expect(isContentEditable(elements[0])).toBe(false)
  expect(isContentEditable(elements[1])).toBe(false)
  expect(isContentEditable(elements[2])).toBe(true)
  expect(isContentEditable(elements[3])).toBe(true)
})
