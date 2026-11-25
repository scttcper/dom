/**
 * The fixed-shape init dictionaries @ctrl/dom/user-event builds for @ctrl/dom's event constructors
 * (packages/user-event/src/event/createEvent.ts: keyboardEventDict, mouseEventDict,
 * pointerEventDict, inputEventDict) against what those constructors read: a member missing from a
 * builder would silently fall back to its default, a stale one would only cost time.
 *
 * Specs:
 * - WebIDL dictionaries: https://webidl.spec.whatwg.org/#es-dictionary
 * - UI Events: EventModifierInit https://w3c.github.io/uievents/#dictdef-eventmodifierinit,
 *   KeyboardEventInit https://w3c.github.io/uievents/#dictdef-keyboardeventinit,
 *   MouseEventInit https://w3c.github.io/uievents/#dictdef-mouseeventinit,
 *   InputEventInit https://w3c.github.io/uievents/#dictdef-inputeventinit
 * - Pointer Events: PointerEventInit https://w3c.github.io/pointerevents/#dom-pointereventinit
 */
import {describe, expect, test} from 'vitest'
import {createWindow} from '@ctrl/dom'
import {
  inputEventDict,
  keyboardEventDict,
  mouseEventDict,
  pointerEventDict,
} from '../../src/event/createEvent.ts'

type Ctor = new (type: string, init: object) => object
const window = createWindow() as unknown as Record<string, Ctor>
const eventInit = {bubbles: true, cancelable: true, composed: true}

/** The members a constructor reads from its init dictionary. */
function membersRead(Ctor: Ctor): string[] {
  const read = new Set<string>()
  const dict = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key === 'string') read.add(key)
        return undefined
      },
    },
  )
  new Ctor('x', dict)
  return [...read].sort()
}

const builders = [
  [
    'KeyboardEvent',
    (init: Record<string, unknown>) =>
      keyboardEventDict(init, eventInit, undefined),
  ],
  [
    'MouseEvent',
    (init: Record<string, unknown>) =>
      mouseEventDict(init, eventInit, undefined),
  ],
  [
    'PointerEvent',
    (init: Record<string, unknown>) =>
      pointerEventDict(init, eventInit, undefined),
  ],
  [
    'InputEvent',
    (init: Record<string, unknown>) => inputEventDict(init, eventInit),
  ],
] as const

describe('init dictionaries — https://webidl.spec.whatwg.org/#es-dictionary', () => {
  test.each(builders)(
    '%s: the builder supplies exactly the members the @ctrl/dom constructor reads',
    (name, build) => {
      expect(Object.keys(build({})).sort()).toEqual(membersRead(window[name]))
    },
  )

  test.each(builders)(
    '%s: every member is passed through from init, as a spread of init would',
    (name, build) => {
      const members = membersRead(window[name])
      const init: Record<string, unknown> = {}
      for (const [i, key] of members.entries()) init[key] = sample(key, i)
      const dict = build(init) as Record<string, unknown>
      for (const key of members) {
        if (key === 'bubbles' || key === 'cancelable' || key === 'composed')
          expect(dict[key]).toBe(true)
        else expect(dict[key]).toBe(init[key])
      }
    },
  )
})

describe('EventModifierInit — https://w3c.github.io/uievents/#dictdef-eventmodifierinit', () => {
  test("the keyboard's modifier state replaces init's modifiers; modifierHyper and modifierSuper stay init's", () => {
    const flags = {
      Alt: true,
      AltGraph: false,
      CapsLock: true,
      Control: false,
      Fn: true,
      FnLock: false,
      Meta: true,
      NumLock: false,
      ScrollLock: true,
      Shift: false,
      Symbol: true,
      SymbolLock: false,
    }
    const init = {
      altKey: false,
      ctrlKey: true,
      modifierHyper: true,
      modifierSuper: true,
    }
    const event = new window.KeyboardEvent(
      'keydown',
      keyboardEventDict(init, eventInit, flags),
    ) as unknown as {
      altKey: boolean
      ctrlKey: boolean
      getModifierState(key: string): boolean
    }
    expect(event.altKey).toBe(true)
    expect(event.ctrlKey).toBe(false)
    for (const [key, value] of Object.entries(flags))
      expect(event.getModifierState(key)).toBe(value)
    expect(event.getModifierState('Hyper')).toBe(true)
    expect(event.getModifierState('Super')).toBe(true)
  })
})

describe('defaults user-event applies — https://w3c.github.io/pointerevents/#dom-pointereventinit', () => {
  test('pressure is 0.5 while a button is pressed and 0 otherwise; clientX/clientY fall back to x/y', () => {
    expect(pointerEventDict({buttons: 1}, eventInit, undefined).pressure).toBe(
      0.5,
    )
    expect(pointerEventDict({buttons: 0}, eventInit, undefined).pressure).toBe(
      0,
    )
    expect(
      pointerEventDict({buttons: 1, pressure: 0.25}, eventInit, undefined)
        .pressure,
    ).toBe(0.25)
    const mouse = mouseEventDict({x: 3, y: 4}, eventInit, undefined)
    expect([mouse.clientX, mouse.clientY]).toEqual([3, 4])
    const both = mouseEventDict(
      {x: 3, y: 4, clientX: 5, clientY: 6},
      eventInit,
      undefined,
    )
    expect([both.clientX, both.clientY]).toEqual([5, 6])
  })

  test('a missing key, code or inputType reads as "undefined", as upstream\'s String(value)', () => {
    const key = keyboardEventDict({}, eventInit, undefined)
    expect([key.key, key.code]).toEqual(['undefined', 'undefined'])
    expect(inputEventDict({}, eventInit).inputType).toBe('undefined')
  })
})

/** A distinct, valid value for a member. */
function sample(key: string, i: number): unknown {
  switch (key) {
    case 'view':
      return window as unknown
    case 'relatedTarget':
      return null
    case 'coalescedEvents':
    case 'predictedEvents':
      return []
    case 'key':
    case 'code':
    case 'pointerType':
    case 'data':
    case 'inputType':
      return `${key}-${i}`
    case 'dataTransfer':
      return null
    default:
      return i
  }
}
