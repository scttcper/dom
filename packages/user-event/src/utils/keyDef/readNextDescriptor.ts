// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/keyDef/readNextDescriptor.ts

const bracketDict = {
  '{': '}',
  '[': ']',
} as const

type Context = 'pointer' | 'keyboard'

/**
 * Read the next key definition from user input
 *
 * Describe key per `{descriptor}` or `[descriptor]`.
 * Everything else will be interpreted as a single character as descriptor - e.g. `a`.
 * Brackets `{` and `[` can be escaped by doubling - e.g. `foo[[bar` translates to `foo[bar`.
 * A previously pressed key can be released per `{/descriptor}`.
 * Keeping the key pressed can be written as `{descriptor>}`.
 * When keeping the key pressed you can choose how long the key is pressed `{descriptor>3}`.
 * You can then release the key per `{descriptor>3/}` or keep it pressed and continue with the next key.
 */
export function readNextDescriptor(text: string, context: Context, offset = 0) {
  const char = text[offset]
  if (char === '{' || char === '[') {
    if (text[offset + 1] !== char) {
      return readTag(text, offset, char, context)
    }
    return printableChar(char, 2)
  }
  assertDescriptor(char, text, offset, context)
  return printableChar(char, 1)
}

function printableChar(descriptor: string, consumedLength: number) {
  return {
    type: '' as const,
    consumedLength,
    descriptor,
    releasePrevious: false,
    releaseSelf: true,
    repeat: 1,
  }
}

function readTag(
  text: string,
  offset: number,
  startBracket: keyof typeof bracketDict,
  context: Context,
) {
  let pos = offset + 1
  const releasePrevious = text[pos] === '/'
  if (releasePrevious) pos++

  const escaped = startBracket === '{' && text[pos] === '\\'
  if (escaped) pos++
  const start = pos
  if (!escaped) {
    while (isWordChar(text.charCodeAt(pos))) pos++
  }
  if (pos === start) {
    const char = text[pos]
    if (
      !char ||
      (!escaped &&
        (startBracket === '[' || char === '}' || char === '>' || char === '/'))
    ) {
      throw new Error(
        getErrorMessage('key descriptor', char, text.slice(offset), context),
      )
    }
    pos++
  }
  const descriptor = text.slice(start, pos)

  let repeat: number | undefined
  if (text[pos] === '>' && isDigit(text.charCodeAt(pos + 1))) {
    const digits = pos + 1
    pos = digits + 1
    while (isDigit(text.charCodeAt(pos))) pos++
    repeat = Math.max(Number(text.slice(digits, pos)), 1)
  }

  const releaseSelfModifier =
    text[pos] === '/' || (repeat === undefined && text[pos] === '>')
      ? text[pos]
      : ''

  pos += releaseSelfModifier.length

  const expectedEndBracket = bracketDict[startBracket]
  if (text[pos] !== expectedEndBracket) {
    throw new Error(
      getErrorMessage(
        [
          repeat === undefined && 'repeat modifier',
          !releaseSelfModifier && 'release modifier',
          `"${expectedEndBracket}"`,
        ]
          .filter(Boolean)
          .join(' or '),
        text[pos],
        text.slice(offset),
        context,
      ),
    )
  }

  let releaseSelf: boolean | undefined
  if (releaseSelfModifier || repeat !== undefined)
    releaseSelf = releaseSelfModifier === '/'

  return {
    type: startBracket,
    consumedLength: pos + 1 - offset,
    descriptor,
    releasePrevious,
    repeat: repeat ?? 1,
    releaseSelf,
  }
}

function assertDescriptor(
  descriptor: string | undefined,
  text: string,
  pos: number,
  context: Context,
): asserts descriptor is string {
  if (!descriptor) {
    throw new Error(getErrorMessage('key descriptor', text[pos], text, context))
  }
}

function isDigit(code: number) {
  return code >= 48 && code <= 57
}

/** ASCII word characters allowed in unescaped key and code names. */
function isWordChar(code: number) {
  return (
    isDigit(code) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  )
}

function getErrorMessage(
  expected: string,
  found: string | undefined,
  text: string,
  context: Context,
) {
  return `Expected ${expected} but found "${found ?? ''}" in "${text}"
    See ${
      context === 'pointer'
        ? `https://testing-library.com/docs/user-event/pointer#pressing-a-button-or-touching-the-screen`
        : `https://testing-library.com/docs/user-event/keyboard`
    }
    for more information about how userEvent parses your input.`
}
