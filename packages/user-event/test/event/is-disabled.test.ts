/**
 * isDisabled over @ctrl/dom's node records (packages/user-event/src/utils/misc/isDisabled.ts):
 * the climb must answer what upstream's loop over the wrappers answers, beyond the cases the
 * ported upstream test covers.
 *
 * Specs: HTML — the disabled attribute: https://html.spec.whatwg.org/#enabling-and-disabling-form-controls:-the-disabled-attribute
 *   (a disabled fieldset's first legend child: https://html.spec.whatwg.org/#the-fieldset-element)
 * Upstream: https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/isDisabled.ts
 */
import {describe, expect, test} from 'vitest'
import {createWindow} from '@ctrl/dom'
import {isDisabled} from '../../src/utils/misc/isDisabled.ts'

/** Upstream's function, verbatim, on the public API. */
function upstream(element: any): boolean {
  const tags = ['button', 'input', 'select', 'textarea', 'optgroup', 'option']
  const isType = (el: any, names: string[]) =>
    !(el.namespaceURI && el.namespaceURI !== 'http://www.w3.org/1999/xhtml') &&
    names.includes(el.tagName.toLowerCase())
  for (let el = element; el; el = el.parentElement) {
    if (isType(el, tags)) {
      if (el.hasAttribute('disabled')) return true
    } else if (isType(el, ['fieldset'])) {
      if (
        el.hasAttribute('disabled') &&
        !el.querySelector(':scope > legend')?.contains(element)
      )
        return true
    } else if (el.tagName.includes('-')) {
      if (el.constructor.formAssociated && el.hasAttribute('disabled'))
        return true
    }
  }
  return false
}

describe('isDisabled — https://html.spec.whatwg.org/#enabling-and-disabling-form-controls:-the-disabled-attribute', () => {
  test('every element of a tree of forms, fieldsets, legends, controls and foreign elements answers as upstream', () => {
    // The window's members are typed loosely here: this package declares its own DOM types.
    const window = createWindow() as any
    const document = window.document
    window.customElements.define(
      'fa-control',
      class extends window.HTMLElement {
        static formAssociated = true
      },
    )
    document.body.innerHTML = `
      <form id="f">
        <fieldset disabled>
          <legend><span><input id="in-first-legend"></span></legend>
          <legend><input id="in-second-legend"></legend>
          <div><legend><input id="in-nested-legend"></legend></div>
          <input id="plain"><select><optgroup disabled><option>a</option></optgroup><option>b</option></select>
          <fieldset><legend><button>x</button></legend><textarea></textarea></fieldset>
        </fieldset>
        <fieldset disabled><input id="no-legend"></fieldset>
        <fieldset><input><button disabled><span>in a disabled button</span></button></fieldset>
        <fa-control disabled><span>in a form-associated custom element</span></fa-control>
        <un-defined disabled><span>in an undefined custom element</span></un-defined>
        <svg disabled><fieldset disabled></fieldset><g><text>svg</text></g></svg>
        <div disabled><p>never disableable</p></div>
      </form>`
    // Elements the parser cannot make: a null-namespace and a prefixed `button`.
    const nullNs = document.body.appendChild(
      document.createElementNS(null, 'button'),
    )
    nullNs.setAttribute('disabled', '')
    nullNs.appendChild(document.createElement('span'))
    const prefixed = document.body.appendChild(
      document.createElementNS('http://www.w3.org/1999/xhtml', 'x-y:button'),
    )
    prefixed.setAttribute('disabled', '')
    prefixed.appendChild(document.createElement('span'))
    // A shadow tree: `parentElement` ends the climb at the shadow root.
    const host = document
      .querySelector('#plain')!
      .parentElement!.appendChild(document.createElement('div'))
    host.attachShadow({mode: 'open'}).innerHTML = '<input id="in-shadow">'

    const all = [
      ...document.querySelectorAll('*'),
      host.shadowRoot!.querySelector('input')!,
    ]
    expect(all.length).toBeGreaterThan(40)
    const disabled: string[] = []
    for (const el of all) {
      const expected = upstream(el)
      expect(isDisabled(el as never), `${el.tagName}#${el.id}`).toBe(expected)
      if (expected && el.id) disabled.push(el.id)
    }
    // The cases the climb exists for did come out both ways.
    expect(disabled).toEqual([
      'in-second-legend',
      'in-nested-legend',
      'plain',
      'no-legend',
    ])
    expect(
      isDisabled(document.querySelector('#in-first-legend') as never),
    ).toBe(false)
    expect(isDisabled(host.shadowRoot!.querySelector('input') as never)).toBe(
      false,
    )
  })
})
