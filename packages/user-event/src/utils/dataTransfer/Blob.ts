// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/dataTransfer/Blob.ts

import type {Blob, FileReader} from '../../dom-types.ts'
// jsdom does not implement Blob.text()

export function readBlobText(blob: Blob, FileReader: {new (): FileReader}) {
  return new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onerror = rej
    fr.onabort = rej
    fr.onload = () => {
      res(String(fr.result as string))
    }
    fr.readAsText(blob)
  })
}
