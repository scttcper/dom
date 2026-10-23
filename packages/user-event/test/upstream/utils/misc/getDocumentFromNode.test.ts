// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/misc/getDocumentFromNode.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {getDocumentFromNode} from '#src/utils/index.ts'

test('get document node', () => {
  expect(getDocumentFromNode(document.createElement('a'))).toBe(document)
  expect(getDocumentFromNode(document)).toBe(document)
})
