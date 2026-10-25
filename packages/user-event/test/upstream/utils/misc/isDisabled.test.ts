// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/misc/isDisabled.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import cases from '#testHelpers/jest-in-case.ts'
import {isDisabled} from '#src/utils/index.ts'
import {render} from '#testHelpers'

const HTMLElement = window.HTMLElement

window.customElements.define(
  'form-associated',
  class FormAssociated extends HTMLElement {
    static formAssociated = true
    get disabled() {
      return this.hasAttribute('disabled')
    }
  },
)

window.customElements.define(
  'custom-el',
  class CustomEl extends HTMLElement {
    get disabled() {
      return this.hasAttribute('disabled')
    }
  },
)

// https://html.spec.whatwg.org/multipage/semantics-other.html#disabled-elements
// https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#enabling-and-disabling-form-controls:-the-disabled-attribute
cases(
  'check if element is disabled',
  ({html, node = '//input', expected = true}) => {
    const {xpathNode} = render(html)
    expect(isDisabled(xpathNode<Element>(node))).toBe(expected)
  },
  {
    control: {
      html: `<input/>`,
      expected: false,
    },
    'disabled control': {
      html: `<input disabled/>`,
    },
    'control in disabled fieldset': {
      html: `<fieldset disabled><input/></fieldset>`,
    },
    'control in first legend of disabled fieldset': {
      html: `<fieldset disabled><legend><input/></legend></fieldset>`,
      expected: false,
    },
    'control in other legend of disabled fieldset': {
      html: `<fieldset disabled><legend></legend><legend><input/></legend></fieldset>`,
    },
    'control in nested legend of disabled fieldset': {
      html: `<fieldset disabled><div>><legend><input/></legend></div></fieldset>`,
    },
    'element without support for disabled': {
      html: `<div disabled></div>`,
      node: '*',
      expected: false,
    },
    'form-associated disabled custom element': {
      html: `<form-associated disabled></form-associated>`,
      node: '*',
    },
    'form-associated enabled custom element': {
      html: `<form-associated></form-associated>`,
      node: '*',
      expected: false,
    },
    'other custom element': {
      html: `<custom-el disabled></custom-el>`,
      node: '*',
      expected: false,
    },
  },
)
