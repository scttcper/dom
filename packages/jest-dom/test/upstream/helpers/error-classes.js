// Not upstream. to-be-in-the-document.js asserts the matcher throws jest-dom's own
// HtmlElementTypeError; resolve that class from the implementation under test (stock
// jest-dom does not export it, so it is taken from an error its matcher throws).
const stock = process.env.JEST_DOM_IMPL === 'stock'

async function resolveHtmlElementTypeError() {
  if (!stock)
    return (await import('../../../src/utils.ts')).HtmlElementTypeError
  const {toBeInTheDocument} = await import('@testing-library/jest-dom/matchers')
  const context = {
    isNot: false,
    utils: {
      matcherHint: () => '',
      printWithType: () => '',
      printReceived: () => '',
      RECEIVED_COLOR: s => s,
    },
  }
  try {
    toBeInTheDocument.call(context, {})
  } catch (error) {
    return error.constructor
  }
  throw new Error('stock toBeInTheDocument did not throw for a non-element')
}

export const HtmlElementTypeError = await resolveHtmlElementTypeError()
