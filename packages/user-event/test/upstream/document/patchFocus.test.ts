// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/document/patchFocus.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {patchFocus, restoreFocus} from '#src/document/patchFocus.ts'
import {isJsdomEnv, render} from '#testHelpers'

beforeAll(() => {
  patchFocus(globalThis.window.HTMLElement)
  return () => restoreFocus(globalThis.window.HTMLElement)
})

test('dispatch focus events', () => {
  const {
    elements: [a, b],
    getEventSnapshot,
  } = render(`<input id="a"/><input id="b"/>`, {focus: false})

  a.focus()
  b.focus()
  a.blur()
  b.blur()

  expect(getEventSnapshot()).toMatchInlineSnapshot(`
    Events fired on: input#a[value=""],input#b[value=""]
    
    input#a[value=""] - focus: ← null
    input#a[value=""] - focusin: ← null
    input#a[value=""] - blur: → input#b[value=""]
    input#a[value=""] - focusout: → input#b[value=""]
    input#b[value=""] - focus: ← input#a[value=""]
    input#b[value=""] - focusin: ← input#a[value=""]
    input#b[value=""] - blur: → null
    input#b[value=""] - focusout: → null
  `)
})

test('`focus` handler can prevent subsequent `focusin`', () => {
  const {element, getEventSnapshot} = render(`<input/>`, {focus: false})

  element.addEventListener('focus', () => {
    element.blur()
  })

  element.focus()

  if (isJsdomEnv()) {
    // The unpatched focus in Jsdom behaves differently than the browser
    expect(getEventSnapshot()).toMatchInlineSnapshot(`
      Events fired on: input[value=""]
      
      input[value=""] - focus: ← null
      input[value=""] - blur: → null
      input[value=""] - focusout: → null
      input[value=""] - focusin: ← null
    `)
  } else {
    expect(getEventSnapshot()).toMatchInlineSnapshot(`
      Events fired on: input[value=""]
      
      input[value=""] - focus: ← null
      input[value=""] - blur: → null
      input[value=""] - focusout: → null
    `)
  }
})
