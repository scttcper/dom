// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/clipboard/cut.ts

import {type Instance} from '../setup/index.ts'
import {copyOrCut} from './copy.ts'

export function cut(this: Instance) {
  return copyOrCut(this, 'cut')
}
