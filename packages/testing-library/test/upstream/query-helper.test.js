// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/query-helper.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(rtd):`.

import * as queryHelpers from '../../src/query-helpers.ts'
import {configure, getConfig} from '../../src/config.ts'

const originalConfig = getConfig()
beforeEach(() => {
  configure(originalConfig)
})

test('should delegate to config.getElementError', () => {
  const getElementError = vi.fn()
  configure({getElementError})

  const message = 'test Message'
  const container = {} // dummy

  queryHelpers.getElementError(message, container)
  expect(getElementError.mock.calls[0]).toEqual([message, container])
})
