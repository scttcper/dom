// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/pointer/keyMap.ts

import {type pointerKey} from '../system/pointer/index.ts'

export const defaultKeyMap: pointerKey[] = [
  {name: 'MouseLeft', pointerType: 'mouse', button: 'primary'},
  {name: 'MouseRight', pointerType: 'mouse', button: 'secondary'},
  {name: 'MouseMiddle', pointerType: 'mouse', button: 'auxiliary'},
  {name: 'TouchA', pointerType: 'touch'},
  {name: 'TouchB', pointerType: 'touch'},
  {name: 'TouchC', pointerType: 'touch'},
]
