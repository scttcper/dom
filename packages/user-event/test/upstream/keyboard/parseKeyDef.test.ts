// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/keyboard/parseKeyDef.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import cases from '#testHelpers/jest-in-case.ts'
import {parseKeyDef} from '#src/keyboard/parseKeyDef.ts'
import {defaultKeyMap} from '#src/keyboard/keyMap.ts'
import {keyboardKey} from '#src/index.ts'

cases(
  'reference key per',
  ({text, keyDef}) => {
    const parsed = parseKeyDef(defaultKeyMap, `/${text}/`)
    keyDef = Array.isArray(keyDef) ? keyDef : [keyDef]
    expect(parsed).toHaveLength(2 + keyDef.length)
    expect(parsed.slice(1, -1)).toEqual(
      keyDef.map(d =>
        expect.objectContaining({
          keyDef: expect.objectContaining(d) as keyboardKey,
        }),
      ),
    )
  },
  {
    code: {
      text: '[ControlLeft]',
      keyDef: {key: 'Control', code: 'ControlLeft'},
    },
    'unimplemented code': {
      text: '[Foo]',
      keyDef: {key: 'Unknown', code: 'Foo'},
    },
    key: {
      text: '{Control}',
      keyDef: {key: 'Control', code: 'ControlLeft'},
    },
    'unimplemented key': {
      text: '{Foo}',
      keyDef: {key: 'Foo', code: 'Unknown'},
    },
    'printable character': {
      text: 'a',
      keyDef: {key: 'a', code: 'KeyA'},
    },
    'modifiers as printable characters': {
      text: '/',
      keyDef: {key: '/', code: 'Unknown'},
    },
    '{ as printable': {
      text: '{{',
      keyDef: {key: '{', code: 'BracketLeft', shiftKey: true},
    },
    '{ as printable followed by descriptor': {
      text: '{{{foo}',
      keyDef: [
        {key: '{', code: 'BracketLeft', shiftKey: true},
        {key: 'foo', code: 'Unknown'},
      ],
    },
    '{ as key with modifiers': {
      text: '{\\{>5/}',
      keyDef: {key: '{', code: 'BracketLeft', shiftKey: true},
    },
    'modifier as key with modifiers': {
      text: '{/\\/>5/}',
      keyDef: {key: '/', code: 'Unknown'},
    },
    '[ as printable': {
      text: '[[',
      keyDef: {key: '[', code: 'BracketLeft'},
    },
  },
)

cases(
  'modifiers',
  ({text, modifiers}) => {
    const parsed = parseKeyDef(defaultKeyMap, `/${text}/`)
    expect(parsed).toHaveLength(3)
    expect(parsed[1]).toEqual(expect.objectContaining(modifiers))
  },
  {
    'no releasePrevious': {
      text: '{Control}',
      modifiers: {releasePrevious: false},
    },
    'releasePrevious per key': {
      text: '{/Control}',
      modifiers: {releasePrevious: true},
    },
    'releasePrevious per code': {
      text: '[/ControlLeft]',
      modifiers: {releasePrevious: true},
    },
    'default releaseSelf': {
      text: '{Control}',
      modifiers: {releaseSelf: true},
    },
    'keep key pressed per key': {
      text: '{Control>}',
      modifiers: {releaseSelf: false},
    },
    'keep key pressed per code': {
      text: '[Control>]',
      modifiers: {releaseSelf: false},
    },
    'keep key pressed with repeatModifier': {
      text: '{Control>2}',
      modifiers: {releaseSelf: false},
    },
    'release after repeatModifier': {
      text: '{Control>2/}',
      modifiers: {releaseSelf: true},
    },
  },
)
