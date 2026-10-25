// Ported from @testing-library/jest-dom@7.0.1
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/__tests__/to-be-pressed.js
// Mechanical port: helper/util import paths, and inline snapshots regenerated under vitest
// by the stock implementation (JEST_DOM_IMPL=stock vitest -u); assertions unchanged unless
// noted inline.
import {render} from './helpers/test-utils.js'

describe('.toBePressed', () => {
  test('handles button element', () => {
    const {queryByTestId} = render(`
      <button data-testid="button-pressed" aria-pressed="true" />
      <button data-testid="button-not-pressed" aria-pressed="false" />
    `)

    expect(queryByTestId('button-pressed')).toBePressed()
    expect(queryByTestId('button-not-pressed')).not.toBePressed()
  })

  test('handles element with role="button"', () => {
    const {queryByTestId} = render(`
      <span role="button" aria-pressed="true" data-testid="button-pressed" />
      <span role="button" aria-pressed="false" data-testid="button-not-pressed" />
    `)

    expect(queryByTestId('button-pressed')).toBePressed()
    expect(queryByTestId('button-not-pressed')).not.toBePressed()
  })

  test('handles input with button type', () => {
    const {queryByTestId} = render(`
      <input type="button" aria-pressed="true" data-testid="button-pressed" />
      <input type="button" aria-pressed="false" data-testid="button-not-pressed" />
    `)

    expect(queryByTestId('button-pressed')).toBePressed()
    expect(queryByTestId('button-not-pressed')).not.toBePressed()
  })

  test('throw an error when pressable element is not pressed but expected to be', () => {
    const {queryByTestId} = render(`
      <button data-testid="button" aria-pressed="false" />
    `)

    expect(() => expect(queryByTestId('button')).toBePressed())
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toBePressed()

        Expected element to have:
          aria-pressed="true"
        Received:
          aria-pressed="false"]
      `)
  })

  test('throw an error when pressable element is pressed but expected not to be', () => {
    const {queryByTestId} = render(`
      <button data-testid="button" aria-pressed="true" />
    `)

    expect(() => expect(queryByTestId('button')).not.toBePressed())
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).not.toBePressed()

        Expected element to have:
          aria-pressed="false"
        Received:
          aria-pressed="true"]
      `)
  })

  test('throw an error when pressable element has invalid aria-pressed attribute', () => {
    const {queryByTestId} = render(`
      <button data-testid="button" aria-pressed="invalid" />
    `)

    expect(() =>
      expect(queryByTestId('button')).toBePressed(),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Only button or input with type="button" or element with role="button" and a valid aria-pressed attribute can be used with .toBePressed()]`,
    )
  })

  test('throws an error when element is not a button', () => {
    const {queryByTestId} = render(
      `<span data-testid="span" aria-pressed="true" />`,
    )

    expect(() =>
      expect(queryByTestId('span')).toBePressed(),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Only button or input with type="button" or element with role="button" and a valid aria-pressed attribute can be used with .toBePressed()]`,
    )
  })
})
