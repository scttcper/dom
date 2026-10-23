// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/setup/wrapAsync.ts

import {getConfig} from './dtl.ts'

/**
 * Wrap an internal Promise
 */
export function wrapAsync<R>(implementation: () => Promise<R> | R): Promise<R> {
  return getConfig().asyncWrapper(implementation)
}
