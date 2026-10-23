// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/misc/isVisible.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {screen} from '@testing-library/dom'
import {isVisible} from '#src/utils/index.ts'
import {setup} from '#testHelpers'

test('check if element is visible', async () => {
  setup(`
    <input data-testid="visibleInput"/>
    <input data-testid="hiddenInput" hidden/>
    <input data-testid="styledHiddenInput" style="display: none">
    <input data-testid="styledDisplayedInput" hidden style="display: block"/>
    <div style="display: none"><input data-testid="childInput" /></div>
    <input data-testid="styledVisibiliyHiddenInput" style="visibility: hidden">
  `)

  expect(isVisible(screen.getByTestId('visibleInput'))).toBe(true)
  expect(isVisible(screen.getByTestId('styledDisplayedInput'))).toBe(true)
  expect(isVisible(screen.getByTestId('styledHiddenInput'))).toBe(false)
  expect(isVisible(screen.getByTestId('childInput'))).toBe(false)
  expect(isVisible(screen.getByTestId('hiddenInput'))).toBe(false)
  expect(isVisible(screen.getByTestId('styledVisibiliyHiddenInput'))).toBe(
    false,
  )
})
