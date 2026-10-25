// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/get-node-text.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(ctrl-dom):`.

import {getNodeText} from '../../src/get-node-text.ts'
import {render} from '../helpers/test-utils.js'

test('it prints out the text content of a container', () => {
  const {container} = render('Hello <!--skipped-->World!')
  expect(getNodeText(container)).toMatchInlineSnapshot(`Hello World!`)
})

test('it prints the value for submit and button inputs', () => {
  const {container} = render(
    '<input type="submit" value="save"><input type="button" value="reset">',
  )

  expect(getNodeText(container.firstChild)).toMatchInlineSnapshot(`save`)

  expect(getNodeText(container.lastChild)).toMatchInlineSnapshot(`reset`)
})
