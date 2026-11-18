import {createWindow, type MouseEvent} from '@ctrl/dom'
import {expect, test} from 'vitest'
import type {Document, Element} from '../../src/dom-types.ts'
import userEvent from '../../src/index.ts'

test('custom key codes stay held across keyboard and pointer calls', async () => {
  const win = createWindow({html: '<button>Go</button>'})
  const button = win.document.querySelector('button')!
  const modifiers: boolean[] = []
  button.addEventListener('click', event => {
    modifiers.push((event as MouseEvent).shiftKey)
  })
  const options = {
    document: win.document as unknown as Document,
    delay: null,
    keyboardMap: [
      {code: 'constructor', key: 'Shift'},
      {code: '__proto__', key: 'Shift'},
    ],
  }
  const state = await userEvent.keyboard('[constructor>][__proto__>]', options)
  expect(state.keyboard.getPressedKeys()).toEqual(options.keyboardMap)
  const shared = {...options, keyboardState: state}
  await userEvent.keyboard('[/constructor]', shared)
  await userEvent.click(button as unknown as Element, shared)
  await userEvent.keyboard('[/__proto__]', shared)
  await userEvent.click(button as unknown as Element, shared)
  expect(modifiers).toEqual([true, false])
  expect(state.keyboard.getPressedKeys()).toEqual([])
})
