// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/event/dispatchEvent.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {behavior} from '#src/event/behavior/index.ts'
import {createConfig, createInstance} from '#src/setup/setup.ts'
import {render} from '#testHelpers'

const mockPlugin = vi
  .spyOn(behavior as Required<typeof behavior>, 'click')
  .mockImplementation(() => void 0)

afterEach(() => {
  mockPlugin.mockClear()
})

function setupInstance() {
  return createInstance(createConfig()).instance
}

test('keep default behavior', () => {
  const {element} = render(`<input type="checkbox"/>`)

  setupInstance().dispatchUIEvent(element, 'click')

  expect(mockPlugin).toBeCalledTimes(1)
  expect(element).toBeChecked()
})

test('replace default behavior', () => {
  const {element} = render(`<input type="checkbox"/>`)

  const mockBehavior = vi.fn(() => void 0)
  mockPlugin.mockImplementationOnce(() => mockBehavior)

  setupInstance().dispatchUIEvent(element, 'click')

  expect(mockPlugin).toBeCalledTimes(1)
  expect(element).not.toBeChecked()
  expect(mockBehavior).toBeCalled()
})

test('prevent replaced default behavior', () => {
  const {element} = render(`<input type="checkbox"/>`)
  element.addEventListener('click', e => {
    expect(e).toHaveProperty('defaultPrevented', false)
    e.preventDefault()
    expect(e).toHaveProperty('defaultPrevented', true)
  })

  const mockBehavior = vi.fn(() => void 0)
  mockPlugin.mockImplementationOnce(() => mockBehavior)

  setupInstance().dispatchUIEvent(element, 'click')

  expect(mockPlugin).toBeCalledTimes(1)
  expect(element).not.toBeChecked()
  expect(mockBehavior).not.toBeCalled()
})
