// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/convenience/tab.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {setup} from '#testHelpers'

test('tab', async () => {
  const {
    elements: [elA, elB, elC],
    user,
  } = setup(`<input id="a"/><input id="b"/><input id="c"/>`, {
    focus: '//input[@id="b"]',
  })

  await user.tab()
  expect(elC).toHaveFocus()

  await user.keyboard('[ShiftLeft>]')
  await user.tab()
  expect(elB).toHaveFocus()

  await user.tab()
  expect(elA).toHaveFocus()

  await user.tab({shift: false})
  expect(elB).toHaveFocus()

  await user.tab({shift: true})
  expect(elA).toHaveFocus()

  // shift=true lifted the shift key
  await user.tab()
  expect(elB).toHaveFocus()
})
