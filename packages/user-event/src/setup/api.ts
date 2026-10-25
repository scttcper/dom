// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/setup/api.ts

import {
  click,
  dblClick,
  tripleClick,
  hover,
  unhover,
  tab,
} from '../convenience/index.ts'
import {keyboard} from '../keyboard/index.ts'
import {copy, cut, paste} from '../clipboard/index.ts'
import {pointer} from '../pointer/index.ts'
import {
  clear,
  deselectOptions,
  selectOptions,
  type,
  upload,
} from '../utility/index.ts'

export const userEventApi = {
  click,
  dblClick,
  tripleClick,
  hover,
  unhover,
  tab,
  keyboard,
  copy,
  cut,
  paste,
  pointer,
  clear,
  deselectOptions,
  selectOptions,
  type,
  upload,
}
