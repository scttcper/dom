// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/setup/index.ts

import {setupMain} from './setup.ts'
import * as directApi from './directApi.ts'

export type {Instance} from './setup.ts'

export const userEvent = {
  ...directApi,
  setup: setupMain,
} as const
