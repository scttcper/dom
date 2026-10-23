/**
 * Event interfaces the window lacks (packages/user-event/src/event/createEvent.ts
 * `buildEventConstructors`): upstream user-event substitutes a bare subclass (e.g.
 * `class PointerEvent extends MouseEvent {}`) and sets every init member with its initializers.
 * jest-environment-rtd hides PointerEvent by default (jsdom 26 parity), so this is the path
 * React Aria's suite takes; the @rtd/dom fast path must not drop pointerType/width/pressure there.
 *
 * Specs: Pointer Events — PointerEventInit: https://w3c.github.io/pointerevents/#pointerevent-interface
 * Upstream: https://github.com/testing-library/user-event/blob/v14.6.8/src/event/createEvent.ts
 */
import {describe, expect, test} from 'vitest'
import {createWindow} from '@rtd/dom'
import {createEvent} from '../../src/event/createEvent.ts'

describe('PointerEvent missing from the window — https://w3c.github.io/pointerevents/#pointerevent-interface', () => {
  test('pointer events are fallback-class instances with the PointerEventInit members set, like upstream', () => {
    const window = createWindow()
    Object.defineProperty(window, 'PointerEvent', {value: undefined, configurable: true})
    const element = window.document.body!.appendChild(window.document.createElement('button'))
    const event = createEvent('pointerdown', element as never, {pointerType: 'mouse', buttons: 1, isPrimary: true}) as unknown as Record<string, unknown>
    expect(event).toBeInstanceOf((window as unknown as {MouseEvent: new () => unknown}).MouseEvent)
    expect(event.constructor.name).toBe('PointerEvent')
    expect(event.pointerType).toBe('mouse')
    expect(event.width).toBe(1)
    expect(event.height).toBe(1)
    expect(event.pressure).toBe(0.5)
    expect(event.isPrimary).toBe(true)
    expect(event.buttons).toBe(1)
    window.close()
  })
})
