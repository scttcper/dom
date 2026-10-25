// @vitest-environment node
// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__node_tests__/screen.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(ctrl-dom):`.

import {screen} from '../../src/index.ts'

test('the screen export throws a helpful error message when no global document is accessible', () => {
  expect(() =>
    screen.getByText(/hello world/i),
  ).toThrowErrorMatchingInlineSnapshot(
    `For queries bound to document.body a global document has to be available... Learn more: https://testing-library.com/s/screen-global-error`,
  )
})
