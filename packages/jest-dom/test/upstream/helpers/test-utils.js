// Ported from @testing-library/jest-dom@7.0.1
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/__tests__/helpers/test-utils.js
// (helpers/document.js is not needed: the vitest environment always provides `document`.)

function render(html) {
  const container = document.createElement('div')
  container.innerHTML = html
  const queryByTestId = testId =>
    container.querySelector(`[data-testid="${testId}"]`)
  // asFragment has been stolen from react-testing-library
  const asFragment = () =>
    document.createRange().createContextualFragment(container.innerHTML)

  // Some tests need to look up global ids with document.getElementById()
  // so we need to be inside an actual document.
  document.body.innerHTML = ''
  document.body.appendChild(container)

  return {container, queryByTestId, asFragment}
}

export {render}
