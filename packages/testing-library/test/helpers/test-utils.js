// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/helpers/test-utils.js (MIT).

import {getQueriesForElement} from '../../src/get-queries-for-element.ts'

function render(html, {container = document.createElement('div')} = {}) {
  container.innerHTML = html
  const containerQueries = getQueriesForElement(container)
  function rerender(newHtml) {
    return render(newHtml, {container})
  }
  return {container, rerender, ...containerQueries}
}

function renderIntoDocument(html) {
  return render(html, {container: document.body})
}

function cleanup() {
  document.body.innerHTML = ''
}

afterEach(cleanup)

export {render, renderIntoDocument, cleanup}
