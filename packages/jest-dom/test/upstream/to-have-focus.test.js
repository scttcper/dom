// Ported from @testing-library/jest-dom@7.0.1
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/__tests__/to-have-focus.js
// Mechanical port: helper/util import paths, and inline snapshots regenerated under vitest
// by the stock implementation (JEST_DOM_IMPL=stock vitest -u); assertions unchanged unless
// noted inline.
import {render} from './helpers/test-utils.js'

test('.toHaveFocus', () => {
  const {container} = render(`
      <div>
        <label for="focused">test</label>
        <input id="focused" type="text" />
        <button type="submit" id="not-focused">Not Focused</button>
      </div>`)

  const focused = container.querySelector('#focused')
  const notFocused = container.querySelector('#not-focused')

  document.body.appendChild(container)
  focused.focus()

  expect(focused).toHaveFocus()
  expect(notFocused).not.toHaveFocus()

  expect(() => expect(focused).not.toHaveFocus()).toThrowError()
  expect(() => expect(notFocused).toHaveFocus()).toThrowError()
})
