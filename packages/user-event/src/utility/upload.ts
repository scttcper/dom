// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utility/upload.ts

import type {
  EventInit,
  File,
  HTMLElement,
  HTMLInputElement,
} from '../dom-types.ts'
import {
  createFileList,
  getWindow,
  isDisabled,
  isElementType,
  setFiles,
} from '../utils/index.ts'
import {type Instance} from '../setup/index.ts'

export interface uploadInit {
  changeInit?: EventInit
}

export async function upload(
  this: Instance,
  element: HTMLElement,
  fileOrFiles: File | File[],
) {
  const input = isElementType(element, 'label') ? element.control : element

  if (!input || !isElementType(input, 'input', {type: 'file' as const})) {
    throw new TypeError(
      `The ${input === element ? 'given' : 'associated'} ${
        input?.tagName
      } element does not accept file uploads`,
    )
  }
  if (isDisabled(element)) return

  const candidates = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]
  const accept = this.config.applyAccept && input.accept
  const tokens = accept
    ? normalize(accept)
        .trim()
        .split(/\s*,\s*/)
    : null
  const multiple = input.multiple
  const files: File[] = []
  for (let i = 0; i < candidates.length; i++) {
    if (!(i in candidates)) continue
    const file = candidates[i]
    if (tokens && !isAcceptableFile(file, tokens)) continue
    files.push(file)
    if (!multiple) break
  }
  return openFileDialog(this, element, input, files)
}

async function openFileDialog(
  instance: Instance,
  element: HTMLElement,
  input: HTMLInputElement & {type: 'file'},
  files: File[],
) {
  const fileDialog = () => {
    // do not fire an input event if the file selection does not change
    if (
      files.length === input.files?.length &&
      files.every((f, i) => f === input.files?.item(i))
    ) {
      return
    }

    setFiles(input, createFileList(getWindow(element), files))
    instance.dispatchUIEvent(input, 'input')
    instance.dispatchUIEvent(input, 'change')
  }

  input.addEventListener('fileDialog', fileDialog)
  try {
    await instance.click(element)
  } finally {
    input.removeEventListener('fileDialog', fileDialog)
  }
}

// When matching files, browsers ignore case and consider jpeg/jpg interchangeable.
function normalize(nameOrType: string) {
  return nameOrType.toLowerCase().replace(/(\.|\/)jpg\b/g, '$1jpeg')
}

function isAcceptableFile(file: File, tokens: string[]) {
  let name: string | undefined
  let type: string | undefined
  for (const token of tokens) {
    if (token.startsWith('.')) {
      name ??= normalize(file.name)
      if (name.endsWith(token)) return true
    } else {
      type ??= normalize(file.type)
      if (token === 'audio/*' || token === 'image/*' || token === 'video/*') {
        if (type.startsWith(token.slice(0, -1))) return true
      } else if (type === token) return true
    }
  }
  return false
}
