// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/level.ts

import {type Instance} from '../../setup/index.ts'

export const ApiLevel = {
  Trigger: 2,
  Call: 1,
} as const
export type ApiLevel = (typeof ApiLevel)[keyof typeof ApiLevel]

export type LevelRefs = Record<ApiLevel, object | undefined>

export function setLevelRef(instance: Instance, level: ApiLevel) {
  instance.levelRefs[level] = {}
}

export function getLevelRef(instance: Instance, level: ApiLevel) {
  return instance.levelRefs[level]
}
