// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/get-user-code-frame.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(ctrl-dom):`.

import jestSnapshotSerializerAnsi from '../helpers/ansi-serializer.js'
import fs from 'fs'
import {getUserCodeFrame} from '../../src/get-user-code-frame.ts'

expect.addSnapshotSerializer(jestSnapshotSerializerAnsi)

// DIVERGENCE(ctrl-dom): Vitest module factories must provide `default` for `import fs from 'fs'`.
vi.mock('fs', () => {
  // We setup the contents of a sample file
  const readFileSync = vi.fn(
    () => `
    import {screen} from '@testing-library/dom'
    it('renders', () => {
      document.body.appendChild(
        document.createTextNode('Hello world')
      )
      screen.debug()
      expect(screen.getByText('Hello world')).toBeInTheDocument()
    })
  `,
  )
  return {readFileSync, default: {readFileSync}}
})

const userStackFrame = 'at somethingWrong (/sample-error/error-example.js:7:14)'

let globalErrorMock

beforeEach(() => {
  // Mock global.Error so we can setup our own stack messages
  globalErrorMock = vi.spyOn(global, 'Error')
})

afterEach(() => {
  global.Error.mockRestore()
})

test('it returns only user code frame when code frames from node_modules are first', () => {
  const stack = `Error: Kaboom
      at Object.<anonymous> (/sample-error/node_modules/@es2050/console/build/index.js:4:10)
      ${userStackFrame}
  `
  // DIVERGENCE(ctrl-dom): Vitest spies invoke implementations with `new`, so use a constructible function.
  globalErrorMock.mockImplementationOnce(function () {
    return {stack}
  })
  const userTrace = getUserCodeFrame(stack)

  expect(userTrace).toMatchInlineSnapshot(`
    /sample-error/error-example.js:7:14
      5 |         document.createTextNode('Hello world')
      6 |       )
    > 7 |       screen.debug()
        |              ^
    
  `)
})

test('it returns only user code frame when node code frames are present afterwards', () => {
  const stack = `Error: Kaboom
      at Object.<anonymous> (/sample-error/node_modules/@es2050/console/build/index.js:4:10)
      ${userStackFrame}
      at Object.<anonymous> (/sample-error/error-example.js:14:1)
      at internal/main/run_main_module.js:17:47
  `
  // DIVERGENCE(ctrl-dom): Vitest spies invoke implementations with `new`, so use a constructible function.
  globalErrorMock.mockImplementationOnce(function () {
    return {stack}
  })
  const userTrace = getUserCodeFrame()

  expect(userTrace).toMatchInlineSnapshot(`
    /sample-error/error-example.js:7:14
      5 |         document.createTextNode('Hello world')
      6 |       )
    > 7 |       screen.debug()
        |              ^
    
  `)
})

test("it returns empty string if file from code frame can't be read", () => {
  // Make fire read purposely fail
  fs.readFileSync.mockImplementationOnce(() => {
    throw Error()
  })
  const stack = `Error: Kaboom
      ${userStackFrame}
  `
  // DIVERGENCE(ctrl-dom): Vitest spies invoke implementations with `new`, so use a constructible function.
  globalErrorMock.mockImplementationOnce(function () {
    return {stack}
  })

  expect(getUserCodeFrame(stack)).toEqual('')
})
