// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/label-helpers.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(rtd):`.

import {getRealLabels} from '../../src/label-helpers.ts'

test('hidden inputs are not labelable', () => {
  const element = document.createElement('input')
  element.type = 'hidden'
  expect(getRealLabels(element)).toEqual([])
})
