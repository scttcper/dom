// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/document/prepareDocument.ts

import type {Document, Element, Event, HTMLInputElement} from '../dom-types.ts'
import {hasRtdUI} from '../rtd.ts'
import {dispatchDOMEvent} from '../event/index.ts'
import {isElementType} from '../utils/index.ts'
import {
  prepareRangeTextInterceptor,
  prepareSelectionInterceptor,
  prepareValueInterceptor,
} from './interceptor.ts'
import {clearInitialValue, getInitialValue} from './UI.ts'

const isPrepared = Symbol('Node prepared with document state workarounds')

type Preparable = {[isPrepared]?: typeof isPrepared}

export function prepareDocument(document: Document) {
  if ((document as Preparable)[isPrepared]) {
    return
  }

  document.addEventListener(
    'focus',
    (e: Event) => {
      const el = e.target as Element

      prepareElement(el)
    },
    {
      capture: true,
      passive: true,
    },
  )

  // Our test environment defaults to `document.body` as `activeElement`.
  // In other environments this might be `null` when preparing.
  // istanbul ignore else
  if (document.activeElement) {
    prepareElement(document.activeElement)
  }

  document.addEventListener(
    'blur',
    (e: Event) => {
      const el = e.target as HTMLInputElement
      const initialValue = getInitialValue(el)
      if (initialValue !== undefined) {
        if (el.value !== initialValue) {
          dispatchDOMEvent(el, 'change')
        }
        clearInitialValue(el)
      }
    },
    {
      capture: true,
      passive: true,
    },
  )

  ;(document as Preparable)[isPrepared] = isPrepared
}

function prepareElement(el: Element) {
  if ((el as Preparable)[isPrepared]) {
    return
  }

  // @rtd/dom elements keep UI value/selection natively (see ../rtd.ts): no interceptors.
  if (isElementType(el, ['input', 'textarea']) && !hasRtdUI(el)) {
    prepareValueInterceptor(el)
    prepareSelectionInterceptor(el)
    prepareRangeTextInterceptor(el)
  }

  ;(el as Preparable)[isPrepared] = isPrepared
}
