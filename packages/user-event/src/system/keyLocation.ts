// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/system/keyboard.ts
//
// Split out of system/keyboard.ts: keyboard/keyMap.ts needs it while system/keyboard.ts is
// still being evaluated (import cycle setup → keyMap → system/keyboard → utils → setup).
// `enum` is not erasable syntax; this object has the shape of the compiled enum.

export const DOM_KEY_LOCATION = Object.freeze({
  STANDARD: 0,
  LEFT: 1,
  RIGHT: 2,
  NUMPAD: 3,
  0: 'STANDARD',
  1: 'LEFT',
  2: 'RIGHT',
  3: 'NUMPAD',
} as const)
export type DOM_KEY_LOCATION = 0 | 1 | 2 | 3
