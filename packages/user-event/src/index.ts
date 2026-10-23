// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/index.ts

// the default export is kept for backward compatibility only...
export {userEvent as default} from './setup/index.ts'

export {userEvent} from './setup/index.ts'
export type {UserEvent} from './setup/setup.ts'
export type {keyboardKey} from './system/keyboard.ts'
export type {pointerKey} from './system/pointer/index.ts'
export {PointerEventsCheckLevel, type Options} from './options.ts'
