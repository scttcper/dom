// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/event/behavior/keyup.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import cases from '#testHelpers/jest-in-case.ts'
import {createConfig, createInstance} from '#src/setup/setup.ts'
import {render} from '#testHelpers'

function setupInstance() {
  return createInstance(createConfig()).instance
}

cases(
  'trigger click for [Space]',
  ({html, hasClick = true, hasChange = false}) => {
    const {element, eventWasFired, getEvents} = render(html)

    setupInstance().dispatchUIEvent(element, 'keyup', {key: ' '})

    expect(eventWasFired('click')).toBe(hasClick)
    if (hasClick) {
      expect(getEvents('click')[0]).toHaveProperty('detail', 0)
    }

    expect(eventWasFired('change')).toBe(hasChange)
  },
  {
    'on checkbox': {
      html: `<input type="checkbox"/>`,
      hasChange: true,
    },
    'on radio': {
      html: `<input type="radio"/>`,
      hasChange: true,
    },
    'on button': {
      html: `<button/>`,
    },
    'omit on other element': {
      html: `<input/>`,
      hasClick: false,
    },
  },
)
