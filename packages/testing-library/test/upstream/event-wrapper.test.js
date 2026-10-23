// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/event-wrapper.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(rtd):`.

import {configure, fireEvent} from '../../src/index.ts'

let originalConfig

beforeEach(() => {
  configure(oldConfig => {
    originalConfig = oldConfig
    return null
  })
})

afterEach(() => {
  vi.clearAllMocks()
  configure(originalConfig)
})

test('fireEvent calls the eventWrapper', () => {
  const mockEventWrapper = vi.fn()
  configure(() => {
    return {eventWrapper: mockEventWrapper}
  })
  const el = document.createElement('div')
  fireEvent.click(el)
  expect(mockEventWrapper).toHaveBeenCalledWith(expect.any(Function))
  expect(mockEventWrapper).toHaveBeenCalledTimes(1)
})

test('fireEvent has a default eventWrapper', () => {
  const el = document.createElement('div')
  expect(() => fireEvent.click(el)).not.toThrow()
})
