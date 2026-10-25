// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/misc/isElementType.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {isElementType} from '#src/utils/index.ts'
import {setup, isCtrlDomEnv} from '#testHelpers'

describe('check element type per namespace, tagname and props', () => {
  test('check in HTML document', async () => {
    const {elements} = setup(`<input readonly="true"/><textarea/>`)

    expect(isElementType(elements[0], 'input')).toBe(true)
    expect(isElementType(elements[0], 'input', {readOnly: false})).toBe(false)
    expect(isElementType(elements[1], 'input')).toBe(false)
    expect(isElementType(elements[1], ['input', 'textarea'])).toBe(true)
    expect(
      isElementType(elements[1], ['input', 'textarea'], {readOnly: false}),
    ).toBe(true)
  })

  // divergence: @ctrl/dom's DOMParser does not parse XML (no XML parser; not needed for React tests).
  test.skipIf(isCtrlDomEnv())('check in XML document', async () => {
    // const {element} = setup(`<input readonly="true"/>`)
    const dom = new DOMParser().parseFromString(
      `
      <root xmlns="http://example.com/foo">
        <input readonly="true"/>
        <input xmlns="http://www.w3.org/1999/xhtml" readonly="true"/>
      </root>
    `,
      'application/xml',
    )
    const xmlInput = dom.getElementsByTagNameNS(
      'http://example.com/foo',
      'input',
    )[0]
    const htmlInput = dom.getElementsByTagNameNS(
      'http://www.w3.org/1999/xhtml',
      'input',
    )[0]

    expect(isElementType(xmlInput, 'input')).toBe(false)
    expect(isElementType(htmlInput, 'input')).toBe(true)
    expect(isElementType(htmlInput, 'input', {readOnly: true})).toBe(true)
    expect(isElementType(htmlInput, 'input', {readOnly: false})).toBe(false)
  })
})
