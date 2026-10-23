// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/document/patchFocus.ts

import type {Document, HTMLElement} from '../dom-types.ts'
import {dispatchDOMEvent} from '../event/index.ts'
import {getActiveElement} from '../utils/index.ts'

const patched = Symbol('patched focus/blur methods')

type FocusOptions = {preventScroll?: boolean}
type PatchablePrototype = HTMLElement & {
  readonly [patched]?: Pick<HTMLElement, 'focus' | 'blur'>
}
type HTMLElementConstructor = {prototype: HTMLElement}

export function patchFocus(HTMLElement: HTMLElementConstructor) {
  const proto = HTMLElement.prototype as PatchablePrototype
  if (proto[patched]) {
    return
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const {focus, blur} = proto

  Object.defineProperties(HTMLElement.prototype, {
    focus: {
      configurable: true,
      value: patchedFocus,
      writable: true,
    },
    blur: {
      configurable: true,
      value: patchedBlur,
      writable: true,
    },
    [patched]: {
      configurable: true,
      get: () => ({focus, blur}),
    },
  })

  let activeCall: symbol

  function patchedFocus(this: HTMLElement, options: FocusOptions) {
    if (this.ownerDocument.visibilityState !== 'hidden') {
      return focus.call(this, options)
    }

    const blurred = getActiveTarget(this.ownerDocument)
    if (blurred === this) {
      return
    }

    const thisCall = Symbol('focus call')
    activeCall = thisCall

    if (blurred) {
      blur.call(blurred)
      dispatchDOMEvent(blurred, 'blur', {relatedTarget: this})
      dispatchDOMEvent(blurred, 'focusout', {
        relatedTarget: activeCall === thisCall ? this : null,
      })
    }
    if (activeCall === thisCall) {
      focus.call(this, options)
      dispatchDOMEvent(this, 'focus', {relatedTarget: blurred})
    }
    if (activeCall === thisCall) {
      dispatchDOMEvent(this, 'focusin', {relatedTarget: blurred})
    }
  }

  function patchedBlur(this: HTMLElement) {
    if (this.ownerDocument.visibilityState !== 'hidden') {
      return blur.call(this)
    }

    const blurred = getActiveTarget(this.ownerDocument)
    if (blurred !== this) {
      return
    }

    const thisCall = Symbol('blur call')
    activeCall = thisCall

    blur.call(this)
    dispatchDOMEvent(blurred, 'blur', {relatedTarget: null})
    dispatchDOMEvent(blurred, 'focusout', {relatedTarget: null})
  }
}

function getActiveTarget(document: Document) {
  const active = getActiveElement(document)
  return active?.tagName === 'BODY' ? null : active
}

export function restoreFocus(HTMLElement: HTMLElementConstructor) {
  const proto = HTMLElement.prototype as PatchablePrototype
  if (proto[patched]) {
    const {focus, blur} = proto[patched]
    Object.defineProperties(HTMLElement.prototype, {
      focus: {
        configurable: true,
        get: () => focus,
      },
      blur: {
        configurable: true,
        get: () => blur,
      },
    })
  }
}
