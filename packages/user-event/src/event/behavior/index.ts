// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/behavior/index.ts

import './click.ts'
import './cut.ts'
import './keydown.ts'
import './keypress.ts'
import './keyup.ts'
import './paste.ts'

export {behavior} from './registry.ts'
export type {BehaviorPlugin} from './registry.ts'
