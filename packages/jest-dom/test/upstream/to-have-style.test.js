// Ported from @testing-library/jest-dom@7.0.1
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/__tests__/to-have-style.js
// Mechanical port: helper/util import paths, and inline snapshots regenerated under vitest
// by the stock implementation (JEST_DOM_IMPL=stock vitest -u); assertions unchanged unless
// noted inline.
import {render} from './helpers/test-utils.js'

// Not upstream: jsdom 30 drops the invalid `cubic-bezier(3, 4, 5, 6)` transition on both
// sides, so the negative case written against jsdom 16 cannot fail there (stock jest-dom
// included). It runs on @ctrl/dom once the css gap below is closed.
const testUnlessJsdom30 =
  process.env.CTRL_DOM_STACK === 'jsdom' ? test.skip : test
// TODO(css): @ctrl/dom's getComputedStyle does not yet apply <style> sheet declarations
// (`.label { color: white }`) or inherit custom properties from `:root`; re-enable then.
const testUnlessCtrlDomCssGap =
  process.env.CTRL_DOM_STACK === 'ctrl-dom' ? test.skip : test
// Not upstream: jsdom 30 computes named colors as rgb() while element.style keeps the keyword;
// stock jest-dom compares strings, so on jsdom 30 these fail for it (ours canonicalizes colors).
const testUnlessStockOnJsdom30 =
  process.env.CTRL_DOM_STACK === 'jsdom' &&
  process.env.JEST_DOM_IMPL === 'stock'
    ? test.skip
    : test
const testUnlessStockOnJsdom30OrCtrlDomCssGap =
  process.env.CTRL_DOM_STACK === 'ctrl-dom'
    ? testUnlessCtrlDomCssGap
    : testUnlessStockOnJsdom30
const testUnlessJsdom30OrCtrlDomCssGap =
  process.env.CTRL_DOM_STACK === 'ctrl-dom'
    ? testUnlessCtrlDomCssGap
    : testUnlessJsdom30

// eslint-disable-next-line max-lines-per-function
describe('.toHaveStyle', () => {
  testUnlessStockOnJsdom30OrCtrlDomCssGap('handles positive test cases', () => {
    const {container} = render(`
          <div class="label" style="background-color: blue; height: 100%">
            Hello World
          </div>
        `)

    const style = document.createElement('style')
    style.innerHTML = `
          .label {
            align-items: center;
            background-color: black;
            color: white;
            float: left;
            transition: opacity 0.2s ease-out, top 0.3s cubic-bezier(1.175, 0.885, 0.32, 1.275);
            transform: translateX(0px);
          }
        `
    document.body.appendChild(style)
    document.body.appendChild(container)

    expect(container.querySelector('.label')).toHaveStyle(`
          height: 100%;
          color: white;
          background-color: blue;
        `)

    expect(container.querySelector('.label')).toHaveStyle(`
          background-color: blue;
          color: white;
        `)

    expect(container.querySelector('.label')).toHaveStyle(
      'transition: opacity 0.2s ease-out, top 0.3s cubic-bezier(1.175, 0.885, 0.32, 1.275)',
    )

    expect(container.querySelector('.label')).toHaveStyle(
      'background-color:blue;color:white',
    )

    expect(container.querySelector('.label')).not.toHaveStyle(`
          color: white;
          font-weight: bold;
        `)

    expect(container.querySelector('.label')).toHaveStyle(`
        Align-items: center;
      `)

    expect(container.querySelector('.label')).toHaveStyle(`
      transform: translateX(0px);
    `)
  })

  testUnlessJsdom30OrCtrlDomCssGap('handles negative test cases', () => {
    const {container} = render(`
    <div class="label" style="background-color: blue; height: 100%">
      Hello World
    </div>
  `)

    const style = document.createElement('style')
    style.innerHTML = `
    .label {
      background-color: black;
      color: white;
      float: left;
      --var-name: 0px;
      transition: opacity 0.2s ease-out, top 0.3s cubic-bezier(1.175, 0.885, 0.32, 1.275);
    }
  `
    document.body.appendChild(style)
    document.body.appendChild(container)

    expect(() =>
      expect(container.querySelector('.label')).toHaveStyle(
        'font-weight: bold',
      ),
    ).toThrowError()

    expect(() =>
      expect(container.querySelector('.label')).not.toHaveStyle('color: white'),
    ).toThrowError()

    expect(() =>
      expect(container.querySelector('.label')).toHaveStyle(
        'transition: all 0.7s ease, width 1.0s cubic-bezier(3, 4, 5, 6);',
      ),
    ).toThrowError()

    // Custom property names are case sensitive
    expect(() =>
      expect(container.querySelector('.label')).toHaveStyle('--VAR-NAME: 0px;'),
    ).toThrowError()

    // Make sure the test fails if the css syntax is not valid
    expect(() =>
      expect(container.querySelector('.label')).not.toHaveStyle(
        'font-weight bold',
      ),
    ).toThrowError()

    expect(() =>
      expect(container.querySelector('.label')).toHaveStyle('color white'),
    ).toThrowError()

    expect(() =>
      expect(container.querySelector('.label')).toHaveStyle('--color: black'),
    ).toThrowError()
    document.body.removeChild(style)
    document.body.removeChild(container)
  })

  test('properly normalizes colors', () => {
    const {queryByTestId} = render(`
      <span data-testid="color-example" style="background-color: #123456">Hello World</span>
    `)
    expect(queryByTestId('color-example')).toHaveStyle(
      'background-color: #123456',
    )
  })

  test('handles inline custom properties (with uppercase letters)', () => {
    const {queryByTestId} = render(`
      <span data-testid="color-example" style="--accentColor: blue">Hello World</span>
    `)
    expect(queryByTestId('color-example')).toHaveStyle('--accentColor: blue')
  })

  testUnlessCtrlDomCssGap('handles global custom properties', () => {
    const style = document.createElement('style')
    style.innerHTML = `
      div {
        --color: blue;
      }
    `

    const {container} = render(`
      <div>
        Hello world
      </div>
    `)

    document.body.appendChild(style)
    document.body.appendChild(container)

    expect(container).toHaveStyle(`--color: blue`)
  })

  test('properly normalizes colors for border', () => {
    const {queryByTestId} = render(`
    <span data-testid="color-example" style="border: 1px solid #fff">Hello World</span>
  `)
    expect(queryByTestId('color-example')).toHaveStyle('border: 1px solid #fff')
  })

  test('handles different color declaration formats', () => {
    const {queryByTestId} = render(`
      <span data-testid="color-example" style="color: rgba(0, 0, 0, 1); background-color: #000000">Hello World</span>
    `)

    expect(queryByTestId('color-example')).toHaveStyle('color: #000000')
    expect(queryByTestId('color-example')).toHaveStyle(
      'background-color: rgba(0, 0, 0, 1)',
    )
  })

  test('handles nonexistent styles', () => {
    const {container} = render(`
          <div class="label" style="background-color: blue; height: 100%">
            Hello World
          </div>
        `)

    expect(container.querySelector('.label')).not.toHaveStyle(
      'whatever: anything',
    )
  })

  describe('object syntax', () => {
    testUnlessStockOnJsdom30('handles styles as object', () => {
      const {container} = render(`
        <div class="label" style="background-color: blue; height: 100%">
          Hello World
        </div>
      `)

      expect(container.querySelector('.label')).toHaveStyle({
        backgroundColor: 'blue',
      })
      expect(container.querySelector('.label')).toHaveStyle({
        backgroundColor: 'blue',
        height: '100%',
      })
      expect(container.querySelector('.label')).not.toHaveStyle({
        backgroundColor: 'red',
        height: '100%',
      })
      expect(container.querySelector('.label')).not.toHaveStyle({
        whatever: 'anything',
      })
    })

    test('Uses px as the default unit', () => {
      const {queryByTestId} = render(`
        <span data-testid="color-example" style="font-size: 12px">Hello World</span>
      `)
      expect(queryByTestId('color-example')).toHaveStyle({
        fontSize: 12,
      })
    })

    test('Fails with an invalid unit', () => {
      const {queryByTestId} = render(`
        <span data-testid="color-example" style="font-size: 12rem">Hello World</span>
      `)
      expect(() => {
        expect(queryByTestId('color-example')).toHaveStyle({fontSize: '12px'})
      }).toThrowError()
    })

    testUnlessStockOnJsdom30('supports dash-cased property names', () => {
      const {container} = render(`
        <div class="label" style="background-color: blue; height: 100%">
          Hello World
        </div>
      `)
      expect(container.querySelector('.label')).toHaveStyle({
        'background-color': 'blue',
      })
    })

    test('requires strict empty properties matching', () => {
      const {container} = render(`
        <div class="label" style="width: 100%;height: 100%">
          Hello World
        </div>
      `)
      expect(container.querySelector('.label')).not.toHaveStyle({
        width: '100%',
        height: '',
      })
      expect(container.querySelector('.label')).not.toHaveStyle({
        width: '',
        height: '',
      })
    })
  })
})
