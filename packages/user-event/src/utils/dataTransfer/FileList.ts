// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/dataTransfer/FileList.ts

import type {File, FileList, Window} from '../../dom-types.ts'
// FileList can not be created per constructor.

export function createFileList(
  window: Window,
  files: File[],
): FileList {
  const list: FileList & Iterable<File> = {
    ...files,
    length: files.length,
    item: (index: number) => list[index],
    [Symbol.iterator]: function* nextFile() {
      for (let i = 0; i < list.length; i++) {
        yield list[i]
      }
    },
  }
  list.constructor = window.FileList

  // guard for environments without FileList
  /* istanbul ignore else */
  if (window.FileList) {
    Object.setPrototypeOf(list, window.FileList.prototype)
  }

  Object.freeze(list)

  return list
}
