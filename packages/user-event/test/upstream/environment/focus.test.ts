// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/environment/focus.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {isJsdomEnv, isCtrlDomEnv, render} from '#testHelpers'

test('focus events are not dispatched in (hidden) browser window', () => {
  const {element, getEventSnapshot} = render(`<input/>`, {focus: false})

  element.focus()
  element.blur()

  // divergence: @ctrl/dom documents are visible and dispatch focus events, like jsdom
  if (isJsdomEnv() || isCtrlDomEnv()) {
    expect(document.visibilityState).not.toBe('hidden')
    expect(getEventSnapshot()).toMatchInlineSnapshot(`
      Events fired on: input[value=""]
      
      input[value=""] - focus: ← null
      input[value=""] - focusin: ← null
      input[value=""] - blur: → null
      input[value=""] - focusout: → null
    `)
  } else {
    expect(document.visibilityState).toBe('hidden')
    expect(getEventSnapshot()).toMatchInlineSnapshot(`
      No events were fired on: input[value=""]
    `)
  }
})
