// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/get-queries-for-element.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(ctrl-dom):`.

import {getQueriesForElement} from '../../src/get-queries-for-element.ts'
import {queries} from '../../src/index.ts'

test('uses default queries', () => {
  const container = document.createElement('div')
  const boundQueries = getQueriesForElement(container)
  expect(Object.keys(boundQueries)).toEqual(Object.keys(queries))
})

test('accepts custom queries', () => {
  const container = document.createElement('div')
  const customQuery = vi.fn()
  const boundQueries = getQueriesForElement(container, {
    ...queries,
    customQuery,
  })
  expect(boundQueries.customQuery).toBeDefined()
})

test('binds functions to container', () => {
  const container = document.createElement('div')
  const mock = vi.fn()
  function customQuery(element) {
    return mock(element)
  }
  const boundQueries = getQueriesForElement(container, {
    customQuery,
  })
  boundQueries.customQuery()
  expect(mock).toHaveBeenCalledWith(container)
})
