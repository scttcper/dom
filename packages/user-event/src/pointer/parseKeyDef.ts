// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/pointer/parseKeyDef.ts

import {type pointerKey} from '../system/pointer/index.ts'
import {readNextDescriptor} from '../utils/index.ts'

export function parseKeyDef(pointerMap: pointerKey[], keys: string) {
  const defs: Array<{
    keyDef: pointerKey
    releasePrevious: boolean
    releaseSelf: boolean
  }> = []

  do {
    const {
      descriptor,
      consumedLength,
      releasePrevious,
      releaseSelf = true,
    } = readNextDescriptor(keys, 'pointer')
    const keyDef = pointerMap.find(p => p.name === descriptor)

    if (keyDef) {
      defs.push({keyDef, releasePrevious, releaseSelf})
    }

    keys = keys.slice(consumedLength)
  } while (keys)

  return defs
}
