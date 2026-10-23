// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/cloneEvent.ts

import type {Event, EventInit} from '../../dom-types.ts'
interface EventConstructor<E extends Event> {
  new (type: string, init: EventInit): E
}

export function cloneEvent<E extends Event>(event: E) {
  return new (event.constructor as EventConstructor<E>)(event.type, event)
}
