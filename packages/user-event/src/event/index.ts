// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/index.ts

import {type EventType, type PointerCoords} from './types.ts'

export type {EventType, PointerCoords}

export {
  dispatchEvent,
  dispatchUIEvent,
  dispatchDOMEvent,
} from './dispatchEvent.ts'
export {blurElement, focusElement} from './focus.ts'
export {input} from './input.ts'
export type {SelectionRange} from './selection/index.ts'
export {
  isAllSelected,
  modifySelectionPerMouseMove,
  setSelectionPerMouseDown,
  selectAll,
} from './selection/index.ts'
