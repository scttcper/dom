// Ported from @testing-library/jest-dom@7.0.1
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/__tests__/to-have-role.js
// Mechanical port: helper/util import paths, and inline snapshots regenerated under vitest
// by the stock implementation (JEST_DOM_IMPL=stock vitest -u); assertions unchanged unless
// noted inline.
import {render} from './helpers/test-utils.js'

describe('.toHaveRole', () => {
  it('matches implicit role', () => {
    const {queryByTestId} = render(`
      <div>
        <button data-testid="continue-button">Continue</button>
      </div>
    `)

    const continueButton = queryByTestId('continue-button')

    expect(continueButton).not.toHaveRole('listitem')
    expect(continueButton).toHaveRole('button')

    expect(() => {
      expect(continueButton).toHaveRole('listitem')
    }).toThrow(/expected element to have role/i)
    expect(() => {
      expect(continueButton).not.toHaveRole('button')
    }).toThrow(/expected element not to have role/i)
  })

  it('matches explicit role', () => {
    const {queryByTestId} = render(`
      <div>
        <div role="button" data-testid="continue-button">Continue</div>
      </div>
    `)

    const continueButton = queryByTestId('continue-button')

    expect(continueButton).not.toHaveRole('listitem')
    expect(continueButton).toHaveRole('button')

    expect(() => {
      expect(continueButton).toHaveRole('listitem')
    }).toThrow(/expected element to have role/i)
    expect(() => {
      expect(continueButton).not.toHaveRole('button')
    }).toThrow(/expected element not to have role/i)
  })

  it('matches multiple explicit roles', () => {
    const {queryByTestId} = render(`
      <div>
        <div role="button switch" data-testid="continue-button">Continue</div>
      </div>
    `)

    const continueButton = queryByTestId('continue-button')

    expect(continueButton).not.toHaveRole('listitem')
    expect(continueButton).toHaveRole('button')
    expect(continueButton).toHaveRole('switch')

    expect(() => {
      expect(continueButton).toHaveRole('listitem')
    }).toThrow(/expected element to have role/i)
    expect(() => {
      expect(continueButton).not.toHaveRole('button')
    }).toThrow(/expected element not to have role/i)
    expect(() => {
      expect(continueButton).not.toHaveRole('switch')
    }).toThrow(/expected element not to have role/i)
  })

  // At this point, we might be testing the details of getImplicitAriaRoles, but
  // it's good to have a gut check
  it('handles implicit roles with multiple conditions', () => {
    const {queryByTestId} = render(`
      <div>
        <a href="/about" data-testid="link-valid">Actually a valid link</a>
        <a data-testid="link-invalid">Not a valid link (missing href)</a>
      </div>
    `)

    const validLink = queryByTestId('link-valid')
    const invalidLink = queryByTestId('link-invalid')

    // valid link has role 'link'
    expect(validLink).not.toHaveRole('listitem')
    expect(validLink).toHaveRole('link')

    expect(() => {
      expect(validLink).toHaveRole('listitem')
    }).toThrow(/expected element to have role/i)
    expect(() => {
      expect(validLink).not.toHaveRole('link')
    }).toThrow(/expected element not to have role/i)

    // invalid link has role 'generic'
    expect(invalidLink).not.toHaveRole('listitem')
    expect(invalidLink).not.toHaveRole('link')
    expect(invalidLink).toHaveRole('generic')

    expect(() => {
      expect(invalidLink).toHaveRole('listitem')
    }).toThrow(/expected element to have role/i)
    expect(() => {
      expect(invalidLink).toHaveRole('link')
    }).toThrow(/expected element to have role/i)
    expect(() => {
      expect(invalidLink).not.toHaveRole('generic')
    }).toThrow(/expected element not to have role/i)
  })
})
