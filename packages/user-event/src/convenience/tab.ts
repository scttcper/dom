// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/convenience/tab.ts

import {type Instance} from '../setup/index.ts'

export async function tab(
  this: Instance,
  {
    shift,
  }: {
    shift?: boolean
  } = {},
) {
  return this.keyboard(
    shift === true
      ? '{Shift>}{Tab}{/Shift}'
      : shift === false
        ? '[/ShiftLeft][/ShiftRight]{Tab}'
        : '{Tab}',
  )
}
