// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/types.ts

import type {
  ClipboardEvent,
  ClipboardEventInit,
  DocumentEventMap,
  Event,
  EventInit,
  FocusEvent,
  FocusEventInit,
  InputEvent,
  InputEventInit,
  KeyboardEvent,
  KeyboardEventInit,
  MouseEvent,
  MouseEventInit,
  PointerEvent,
  PointerEventInit,
  UIEvent,
  UIEventInit,
} from '../dom-types.ts'
import {eventMap} from './eventMap.ts'

export type EventType = keyof typeof eventMap

export type EventTypeInit<K extends EventType> = SpecificEventInit<
  FixedDocumentEventMap[K]
>

export interface FixedDocumentEventMap extends DocumentEventMap {
  input: InputEvent
}

type SpecificEventInit<E extends Event> = E extends InputEvent
  ? InputEventInit
  : E extends ClipboardEvent
    ? ClipboardEventInit
    : E extends KeyboardEvent
      ? KeyboardEventInit
      : E extends PointerEvent
        ? PointerEventInit
        : E extends MouseEvent
          ? MouseEventInit
          : E extends FocusEvent
            ? FocusEventInit
            : E extends UIEvent
              ? UIEventInit
              : EventInit

export interface PointerCoords {
  x?: number
  y?: number
  clientX?: number
  clientY?: number
  offsetX?: number
  offsetY?: number
  pageX?: number
  pageY?: number
  screenX?: number
  screenY?: number
}
