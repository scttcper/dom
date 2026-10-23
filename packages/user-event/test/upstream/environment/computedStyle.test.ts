// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/environment/computedStyle.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {isLegacyJsdomEnv, render} from '#testHelpers'

test('window.getComputedStyle returns resolved inherited style in browser', () => {
  const {element, xpathNode} = render(`
        <div style='pointer-events: none'>
            <button></button>
        </div>`)

  expect(window.getComputedStyle(element)).toHaveProperty(
    'pointer-events',
    'none',
  )
  expect(window.getComputedStyle(xpathNode('//button'))).toHaveProperty(
    'pointer-events',
    isLegacyJsdomEnv() ? '' : 'none', // divergence: jsdom 30 resolves inherited styles
  )
})
