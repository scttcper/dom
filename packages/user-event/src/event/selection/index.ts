// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/index.ts

import {type EditableInputOrTextarea} from '../../utils/index.ts'

export {getInputRange} from './getInputRange.ts'
export {modifySelection} from './modifySelection.ts'
export {moveSelection} from './moveSelection.ts'
export {setSelectionPerMouseDown} from './setSelectionPerMouse.ts'
export {modifySelectionPerMouseMove} from './modifySelectionPerMouse.ts'
export {isAllSelected, selectAll} from './selectAll.ts'
export {setSelectionRange} from './setSelectionRange.ts'
export {setSelection} from './setSelection.ts'
export {updateSelectionOnFocus} from './updateSelectionOnFocus.ts'

export type SelectionRange = {
  node: EditableInputOrTextarea
  start: number
  end: number
}
