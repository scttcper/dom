// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/dataTransfer/FileList.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {createFileList} from '#src/utils/index.ts'

test('implement FileList', () => {
  const file = new File(['hello'], 'hello.png', {type: 'image/png'})
  const list = createFileList(window, [file])

  expect(list).toBeInstanceOf(FileList)
  expect(list).toHaveLength(1)
  expect(list.item(0)).toBe(file)
  expect(list[0]).toBe(file)
  expect(Array.from(list)).toEqual([file])
})
