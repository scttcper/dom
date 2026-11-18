// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/pointer/parseKeyDef.ts

import {type pointerKey} from '../system/pointer/index.ts'
import type {PointerAction} from './index.ts'
import {readNextDescriptor} from '../utils/index.ts'

export function appendKeyActions(
  pointerMap: pointerKey[],
  keys: string,
  actions: PointerAction[],
) {
  let offset = 0
  do {
    const {
      descriptor,
      consumedLength,
      releasePrevious,
      releaseSelf = true,
    } = readNextDescriptor(keys, 'pointer', offset)
    const keyDef = pointerMap.find(p => p.name === descriptor)

    if (keyDef) {
      actions.push({keyDef, releasePrevious, releaseSelf})
    }

    offset += consumedLength
  } while (offset < keys.length)
}
