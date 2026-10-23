// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/edit/setFiles.ts

import type {FileList, HTMLInputElement} from '../../dom-types.ts'
// It is not possible to create a real FileList programmatically.
// Therefore assigning `files` property with a programmatically created FileList results in an error.
// Just assigning the property (as per fireEvent) breaks the interweaving with the `value` property.

const fakeFiles = Symbol('files and value properties are mocked')

type FakeFilesInput = HTMLInputElement & {
  [fakeFiles]?: {
    restore: () => void
  }
}

function restoreProperty<T extends object>(
  obj: T,
  prop: keyof T,
  descriptor?: PropertyDescriptor,
) {
  if (descriptor) {
    Object.defineProperty(obj, prop, descriptor)
  } else {
    delete obj[prop]
  }
}

export function setFiles(
  el: FakeFilesInput & {type: 'file'},
  files: FileList,
) {
  el[fakeFiles]?.restore()

  const typeDescr = Object.getOwnPropertyDescriptor(el, 'type')
  const valueDescr = Object.getOwnPropertyDescriptor(el, 'value')
  const filesDescr = Object.getOwnPropertyDescriptor(el, 'files')

  function restore() {
    restoreProperty(el, 'type', typeDescr)
    restoreProperty(el, 'value', valueDescr)
    restoreProperty(el, 'files', filesDescr)
  }
  el[fakeFiles] = {restore}

  Object.defineProperties(el, {
    files: {
      configurable: true,
      get: () => files,
    },
    value: {
      configurable: true,
      get: () => (files.length ? `C:\\fakepath\\${files[0].name}` : ''),
      set(v: string) {
        if (v === '') {
          restore()
        } else {
          valueDescr?.set?.call(el, v)
        }
      },
    },
    type: {
      configurable: true,
      get: () => 'file',
      set(v: string) {
        if (v !== 'file') {
          restore()
          // In the browser the value will be empty.
          // In Jsdom the value will be the same as
          // before this element became file input - which might be empty.
          ;(el as HTMLInputElement).type = v
        }
      },
    },
  })
}
