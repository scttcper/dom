// Ported from @testing-library/jest-dom@7.0.1
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/__tests__/to-be-empty.js
// Mechanical port: helper/util import paths, and inline snapshots regenerated under vitest
// by the stock implementation (JEST_DOM_IMPL=stock vitest -u); assertions unchanged unless
// noted inline.
import {render} from './helpers/test-utils.js'

test('.toBeEmpty', () => {
  // @deprecated intentionally hiding warnings for test clarity
  const spy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const {queryByTestId} = render(`
    <span data-testid="not-empty">
        <span data-testid="empty"></span>
        <svg data-testid="svg-empty"></svg>
    </span>`)

  const empty = queryByTestId('empty')
  const notEmpty = queryByTestId('not-empty')
  const svgEmpty = queryByTestId('svg-empty')
  const nonExistantElement = queryByTestId('not-exists')
  const fakeElement = {thisIsNot: 'an html element'}

  expect(empty).toBeEmpty()
  expect(svgEmpty).toBeEmpty()
  expect(notEmpty).not.toBeEmpty()

  // negative test cases wrapped in throwError assertions for coverage.
  expect(() => expect(empty).not.toBeEmpty()).toThrowError()

  expect(() => expect(svgEmpty).not.toBeEmpty()).toThrowError()

  expect(() => expect(notEmpty).toBeEmpty()).toThrowError()

  expect(() => expect(fakeElement).toBeEmpty()).toThrowError()

  expect(() => {
    expect(nonExistantElement).toBeEmpty()
  }).toThrowError()
  spy.mockRestore()
})
