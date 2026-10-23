// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/wrapEvent.ts

import {getConfig} from '../setup/dtl.ts'
import type {Element} from '../dom-types.ts'

export function wrapEvent<R>(cb: () => R, _element: Element): R {
  return getConfig().eventWrapper(cb) as unknown as R
}
