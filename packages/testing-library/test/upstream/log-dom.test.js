// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/log-dom.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(ctrl-dom):`.

import {getUserCodeFrame} from '../../src/get-user-code-frame.ts'
import {logDOM} from '../../src/pretty-dom.ts'
import {render} from '../helpers/test-utils.js'

vi.mock('../../src/get-user-code-frame.ts')

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  console.log.mockRestore()
})

test('logDOM logs highlighted prettyDOM to the console', () => {
  const {container} = render('<div>Hello World!</div>')
  logDOM(container)
  expect(console.log).toHaveBeenCalledTimes(1)
  expect(console.log.mock.calls[0][0]).toMatchInlineSnapshot(`
    [36m<div>[39m
      [36m<div>[39m
        [0mHello World![0m
      [36m</div>[39m
    [36m</div>[39m
  `)
})

test('logDOM logs highlighted prettyDOM with code frame to the console', () => {
  getUserCodeFrame.mockImplementationOnce(
    () => `"/home/john/projects/sample-error/error-example.js:7:14
      5 |         document.createTextNode('Hello World!')
      6 |       )
    > 7 |       screen.debug()
        |              ^
    "
  `,
  )
  const {container} = render('<div>Hello World!</div>')
  logDOM(container)
  expect(console.log).toHaveBeenCalledTimes(1)
  expect(console.log.mock.calls[0][0]).toMatchInlineSnapshot(`
    [36m<div>[39m
      [36m<div>[39m
        [0mHello World![0m
      [36m</div>[39m
    [36m</div>[39m

    "/home/john/projects/sample-error/error-example.js:7:14
          5 |         document.createTextNode('Hello World!')
          6 |       )
        > 7 |       screen.debug()
            |              ^
        "
      
  `)
})
