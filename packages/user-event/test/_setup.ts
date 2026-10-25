// Vitest setup for @ctrl/dom/user-event's tests.
//
// Mirrors upstream's test environment (https://github.com/testing-library/user-event/tree/v14.6.8/testenv):
// jest-dom matchers, and upstream's own `toMatchInlineSnapshot` /
// `toThrowErrorMatchingInlineSnapshot` (testenv/modules/inlineSnapshot.js), which compare
// against the `.snapshot` string of the listener helpers with indentation stripped instead of
// serializing with pretty-format. Keeping them lets the ported assertions stay verbatim.

import '@testing-library/jest-dom/vitest'
import {expect} from 'vitest'

type MatcherThis = {
  isNot: boolean
  promise: string
  expand?: boolean
  utils: {
    matcherHint(
      name: string,
      received?: string,
      expected?: string,
      options?: object,
    ): string
    diff(a: unknown, b: unknown, options?: object): string | null
  }
}

function toMatchInlineSnapshot(
  this: MatcherThis,
  actual: unknown,
  expected: string,
) {
  const normalizedActual = stripAddedLinebreaks(
    stripAddedIndentation(
      String((actual as {snapshot?: string})?.snapshot ?? actual),
    ),
  )
  const normalizedExpected = stripAddedLinebreaks(
    stripAddedIndentation(expected),
  )

  return {
    pass: normalizedActual === normalizedExpected,
    message: () =>
      [
        this.utils.matcherHint('toMatchInlineSnapshot', undefined, undefined, {
          isNot: this.isNot,
          promise: this.promise,
        }),
        '',
        this.utils.diff(normalizedExpected, normalizedActual, {
          expand: this.expand,
        }),
      ].join('\n'),
  }
}

function toThrowErrorMatchingInlineSnapshot(
  this: MatcherThis,
  callback: unknown,
  expected: string,
) {
  if (typeof callback === 'function') {
    try {
      const promise = callback()
      if (
        typeof promise === 'object' &&
        promise !== null &&
        'then' in promise
      ) {
        return (promise as Promise<unknown>)
          .then(
            () => ({didThrow: false, actual: undefined}),
            (r: unknown) => ({didThrow: true, actual: r}),
          )
          .then(({didThrow, actual}) =>
            matchError.call(this, didThrow, actual, expected),
          )
      }
    } catch (e) {
      return matchError.call(this, true, e, expected)
    }
    return matchError.call(this, false, undefined, expected)
  } else if (this.promise === 'rejects') {
    return matchError.call(this, true, callback, expected)
  }

  throw new Error('Invalid argument')
}

function matchError(
  this: MatcherThis,
  didThrow: boolean,
  actual: unknown,
  expected: string,
) {
  const normalizedActual =
    didThrow &&
    stripAddedLinebreaks(
      stripAddedIndentation(
        typeof actual === 'object' && actual !== null && 'message' in actual
          ? String((actual as Error).message)
          : String(actual),
      ),
    )
  const normalizedExpected = stripAddedLinebreaks(
    stripAddedIndentation(expected),
  )

  return {
    pass: !!this.isNot === !didThrow && normalizedActual === normalizedExpected,
    message: () =>
      [
        this.utils.matcherHint(
          'toThrowErrorMatchingInlineSnapshot',
          undefined,
          undefined,
          {
            isNot: this.isNot,
            promise: this.promise,
          },
        ),
        '',
        didThrow
          ? this.utils.diff(normalizedExpected, normalizedActual, {
              expand: this.expand,
            })
          : '[Did not throw]',
      ].join('\n'),
  }
}

function stripAddedLinebreaks(normalizedSnapshot: string) {
  return normalizedSnapshot.startsWith('\n') &&
    normalizedSnapshot.endsWith('\n')
    ? normalizedSnapshot.substring(1, normalizedSnapshot.length - 1)
    : normalizedSnapshot
}

const INDENTATION_REGEX = /^([^\S\n]*)\S/m

function stripAddedIndentation(inlineSnapshot: string) {
  const match = inlineSnapshot.match(INDENTATION_REGEX)
  if (!match || !match[1]) {
    return inlineSnapshot
  }

  const indentation = match[1]
  const lines = inlineSnapshot.split('\n')
  if (lines.length <= 2) {
    return inlineSnapshot
  }

  if (lines[0].trim() !== '' || lines[lines.length - 1].trim() !== '') {
    return inlineSnapshot
  }

  for (let i = 1; i < lines.length - 1; i++) {
    if (lines[i] !== '') {
      if (lines[i].indexOf(indentation) !== 0) {
        return inlineSnapshot
      }

      lines[i] = lines[i].substring(indentation.length)
    }
  }

  lines[lines.length - 1] = ''

  return lines.join('\n')
}

expect.extend({
  toMatchInlineSnapshot,
  toThrowErrorMatchingInlineSnapshot,
} as never)
