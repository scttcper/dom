// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/level.ts

import {type Instance} from '../../setup/index.ts'

export const ApiLevel = {
  Trigger: 'trigger',
  Call: 'call',
} as const
export type ApiLevel = (typeof ApiLevel)[keyof typeof ApiLevel]

export type LevelRefs = Record<ApiLevel, number>

// A target's last check can be consulted by a different user-event instance.
let nextLevel = 0

export function setLevelRef(instance: Instance, level: ApiLevel) {
  instance.levelRefs[level] = ++nextLevel
}
