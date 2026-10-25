/**
 * `<input type="number">` with intermediate values that are not valid floating-point numbers.
 *
 * https://html.spec.whatwg.org/#number-state-(type=number) — value sanitization algorithm:
 * "If the value of the element is not a valid floating-point number, then set it to the empty
 * string instead." Valid strings are kept as typed.
 *
 * Upstream user-event on jsdom normalizes the IDL value with `String(Number(v))` (a jsdom
 * workaround in document/interceptor.ts), so `e.target.value` reads "-1" after typing "-1." and
 * "-1500" after "-1.5e3". On @ctrl/dom the UI value is kept by the DOM and the IDL value is
 * sanitized like a browser. Intentional divergence, recorded in docs/deviations.md. What stays
 * identical: the UI value user-event edits (cursor positions, the characters accepted), the
 * number of input events, and `valueAsNumber`/`toHaveValue` once the text is a valid number.
 */

import {describe, expect, test} from 'vitest'
import ctrlDomUserEvent from '../../src/index.ts'
import {getUIValue} from '../../src/document/index.ts'

type CtrlDomDom = {
  createWindow(options?: {html?: string}): {document: Document}
}
const ctrlDom = (await import('@ctrl/dom' as string).catch(
  () => null,
)) as CtrlDomDom | null

describe.skipIf(ctrlDom === null)(
  'number input on @ctrl/dom: https://html.spec.whatwg.org/#number-state-(type=number)',
  () => {
    test('value sanitization keeps valid strings as typed and empties invalid intermediate ones', async () => {
      const {document} = ctrlDom!.createWindow({
        html: '<!doctype html><html><body><input id="n" type="number"></body></html>',
      })
      const input = document.getElementById('n') as HTMLInputElement
      const values: string[] = []
      input.addEventListener('input', () => values.push(input.value))

      const user = ctrlDomUserEvent.setup({document: document as never})
      await user.type(input as never, '-1.5e3')

      // '-' '-1' '-1.' '-1.5' '-1.5e' '-1.5e3' as typed; the invalid ones sanitize to ''
      expect(values).toEqual(['', '-1', '', '-1.5', '', '-1.5e3'])
      expect(getUIValue(input as never)).toBe('-1.5e3')
      expect(input.valueAsNumber).toBe(-1500)
    })
  },
)
