// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/misc.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(ctrl-dom):`.

import {queryByAttribute} from '../../src/index.ts'
import {render} from '../helpers/test-utils.js'

// we used to use queryByAttribute internally, but we don't anymore. Some people
// use it as an undocumented part of the API, so we'll keep it around.
test('queryByAttribute', () => {
  const {container} = render(
    '<div data-foo="bar"></div><div data-foo="rubar"></div>',
  )
  expect(queryByAttribute('data-foo', container, 'bar')).not.toBeNull()
  expect(queryByAttribute('blah', container, 'sup')).toBeNull()
  expect(() => queryByAttribute('data-foo', container, /bar/)).toThrow(
    /multiple/,
  )
})
