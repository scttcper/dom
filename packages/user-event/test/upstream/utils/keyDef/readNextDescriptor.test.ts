// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/keyDef/readNextDescriptor.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import cases from '#testHelpers/jest-in-case.ts'
import {readNextDescriptor} from '#src/utils/index.ts'
import userEvent from '#src/index.ts'

cases(
  'errors',
  ({text, expectedError}) => {
    expect(() => readNextDescriptor(`${text}`, 'keyboard')).toThrow(
      expectedError,
    )
  },
  {
    'missing descriptor': {
      text: '',
      expectedError: 'but found "" in ""',
    },
    'missing closing bracket': {
      text: '{a)',
      expectedError: 'but found ")" in "{a)"',
    },
    'invalid repeat modifier': {
      text: '{a>e}',
      expectedError: 'but found "e" in "{a>e}"',
    },
    'missing bracket after repeat modifier': {
      text: '{a>3)',
      expectedError: 'but found ")" in "{a>3)"',
    },
    'unescaped modifier': {
      text: '{/>5}',
      expectedError: 'but found ">" in "{/>5}"',
    },
  },
)

test('include appropriate docs link in error message', async () => {
  await expect(() => userEvent.keyboard('{')).rejects.toThrow(
    'docs/user-event/keyboard',
  )
  await expect(() => userEvent.pointer('{')).rejects.toThrow(
    'docs/user-event/pointer',
  )
})
