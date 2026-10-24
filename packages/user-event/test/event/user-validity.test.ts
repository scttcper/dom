/**
 * :user-invalid / :user-valid after user-event interactions, as in a browser.
 *
 * Specs:
 *   HTML §4.10.18.1 user validity — https://html.spec.whatwg.org/#user-validity
 *   HTML §4.16.3 :user-invalid — https://html.spec.whatwg.org/#selector-user-invalid
 *   Selectors 4 §9.9 the user-interaction pseudo-classes — https://drafts.csswg.org/selectors-4/#user-pseudos
 *
 * @rtd/dom sets user validity when a `change` event is dispatched at the control
 * (packages/dom/src/html/forms/user-validity.ts): user-event fires it when focus leaves an edited
 * field, on selectOptions and on checkbox clicks, which is where a browser commits the edit. Typing
 * alone (input events) does not show :user-invalid yet, as in Chrome and Firefox.
 */

import {describe, expect, test} from 'vitest'
import rtdUserEvent from '../../src/index.ts'

type RtdDom = {createWindow(options?: {html?: string}): {document: Document}}
const rtd = (await import('@rtd/dom' as string).catch(() => null)) as RtdDom | null

function setup(body: string) {
  const {document} = rtd!.createWindow({html: `<!doctype html><html><body>${body}</body></html>`})
  const user = rtdUserEvent.setup({document: document as never})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const $ = (id: string) => document.getElementById(id) as any
  return {document, user, $}
}

describe.skipIf(rtd === null)('user validity on @rtd/dom — https://html.spec.whatwg.org/#user-validity', () => {
  test('typing an invalid email matches :user-invalid only after the edit is committed by blur (change)', async () => {
    const {user, $} = setup('<input id="e" type="email" required><input id="next">')
    await user.type($('e'), 'not-an-email')
    expect($('e').matches(':user-invalid')).toBe(false)
    await user.tab()
    expect($('e').matches(':user-invalid')).toBe(true)
    await user.click($('e'))
    await user.clear($('e'))
    await user.type($('e'), 'a@b.co')
    await user.tab()
    expect([$('e').matches(':user-invalid'), $('e').matches(':user-valid')]).toEqual([false, true])
  })

  test('focusing and leaving a required field without editing does not set it (no change event)', async () => {
    const {user, $} = setup('<input id="r" required><input id="next">')
    await user.click($('r'))
    await user.tab()
    expect($('r').matches(':user-invalid')).toBe(false)
  })

  test('selectOptions sets it on the select (https://html.spec.whatwg.org/#send-select-update-notifications)', async () => {
    const {user, $} = setup('<select id="s" required><option value="">pick</option><option value="a">A</option></select>')
    await user.selectOptions($('s'), '')
    expect($('s').matches(':user-invalid')).toBe(true)
    await user.selectOptions($('s'), 'a')
    expect($('s').matches(':user-valid')).toBe(true)
  })

  test('pressing Enter clicks the submit button and the submission sets every control (form submission step 5.3)', async () => {
    const {user, $, document} = setup('<form id="f"><input id="a"><textarea id="b" required></textarea><button>go</button></form>')
    document.getElementById('f')!.addEventListener('submit', e => e.preventDefault())
    await user.type($('a'), 'x{Enter}')
    expect([$('a').matches(':user-valid'), $('b').matches(':user-invalid')]).toEqual([true, true])
  })
})
