// Ported from @testing-library/jest-dom@7.0.1
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/__tests__/to-contain-query-matchers.js
// Mechanical port: helper/util import paths, and inline snapshots regenerated under vitest
// by the stock implementation (JEST_DOM_IMPL=stock vitest -u); assertions unchanged unless
// noted inline.
import {render} from './helpers/test-utils.js'

describe('.toContainAnyByAltText / .toContainOneByAltText', () => {
  const {container} = render(`<img data-testid="img" alt="profile photo" />`)

  test('passes when one element matches', () => {
    expect(container).toContainAnyByAltText('profile photo')
    expect(container).toContainOneByAltText('profile photo')
  })

  test('fails with .not when no elements match', () => {
    expect(container).not.toContainAnyByAltText('missing')
    expect(container).not.toContainOneByAltText('missing')
  })

  test('toContainAnyByAltText throws when no elements match', () => {
    expect(() => expect(container).toContainAnyByAltText('missing'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainAnyByAltText(alt text)

        Expected element to contain any descendant by alt text:
          missing
        Received:
          0]
      `)
  })

  test('toContainOneByAltText throws when no elements match', () => {
    expect(() => expect(container).toContainOneByAltText('missing'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByAltText(alt text)

        Expected element to contain one descendant by alt text:
          missing
        Received:
          0]
      `)
  })

  test('toContainOneByAltText throws when multiple elements match', () => {
    const {container: multipleContainer} = render(`
      <img alt="logo" />
      <img alt="logo" />
    `)
    expect(multipleContainer).toContainAnyByAltText('logo')
    expect(() => expect(multipleContainer).toContainOneByAltText('logo'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByAltText(alt text)

        Expected element to contain one descendant by alt text:
          logo
        Received:
          2

        Here are the matching elements:

        [36m<img[39m
          [33malt[39m=[32m"logo"[39m
        [36m/>[39m

        [36m<img[39m
          [33malt[39m=[32m"logo"[39m
        [36m/>[39m]
      `)
  })

  test('.not.toContainOneByAltText throws when exactly one element matches', () => {
    expect(() => expect(container).not.toContainOneByAltText('profile photo'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).not.toContainOneByAltText(alt text)

        Expected element not to contain one descendant by alt text:
          profile photo
        Received:
          1

        Here are the matching elements:

        [36m<img[39m
          [33malt[39m=[32m"profile photo"[39m
          [33mdata-testid[39m=[32m"img"[39m
        [36m/>[39m]
      `)
  })

  test('throws when container is not a valid HTML element', () => {
    expect(() => expect(null).toContainAnyByAltText('profile photo'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(received).toContainAnyByAltText()

        received value must be an HTMLElement or an SVGElement.
        Received has type:  Null
        Received has value: null]
      `)
  })
})

describe('.toContainAnyByDisplayValue / .toContainOneByDisplayValue', () => {
  const {container} = render(`
    <select data-testid="select">
      <option selected>Option A</option>
    </select>
  `)

  test('passes when one element matches', () => {
    expect(container).toContainAnyByDisplayValue('Option A')
    expect(container).toContainOneByDisplayValue('Option A')
  })

  test('fails with .not when no elements match', () => {
    expect(container).not.toContainAnyByDisplayValue('Option B')
    expect(container).not.toContainOneByDisplayValue('Option B')
  })

  test('toContainAnyByDisplayValue throws when no elements match', () => {
    expect(() => expect(container).toContainAnyByDisplayValue('Option B'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainAnyByDisplayValue(display value)

        Expected element to contain any descendant by display value:
          Option B
        Received:
          0]
      `)
  })

  test('toContainOneByDisplayValue throws when no elements match', () => {
    expect(() => expect(container).toContainOneByDisplayValue('Option B'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByDisplayValue(display value)

        Expected element to contain one descendant by display value:
          Option B
        Received:
          0]
      `)
  })

  test('.not.toContainOneByDisplayValue throws when exactly one element matches', () => {
    expect(() => expect(container).not.toContainOneByDisplayValue('Option A'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).not.toContainOneByDisplayValue(display value)

        Expected element not to contain one descendant by display value:
          Option A
        Received:
          1

        Here are the matching elements:

        [36m<select[39m
          [33mdata-testid[39m=[32m"select"[39m
        [36m>[39m
          [0m
              [0m
          [36m<option[39m
            [33mselected[39m=[32m""[39m
          [36m>[39m
            [0mOption A[0m
          [36m</option>[39m
          [0m
            [0m
        [36m</select>[39m]
      `)
  })
})

describe('.toContainAnyByLabelText / .toContainOneByLabelText', () => {
  const {container} = render(`
    <label for="name">Full name</label>
    <input id="name" data-testid="input" placeholder="Enter name" />
  `)

  test('passes when one element matches', () => {
    expect(container).toContainAnyByLabelText('Full name')
    expect(container).toContainOneByLabelText('Full name')
  })

  test('fails with .not when no elements match', () => {
    expect(container).not.toContainAnyByLabelText('Missing label')
    expect(container).not.toContainOneByLabelText('Missing label')
  })

  test('toContainAnyByLabelText throws when no elements match', () => {
    expect(() => expect(container).toContainAnyByLabelText('Missing label'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainAnyByLabelText(label text)

        Expected element to contain any descendant by label text:
          Missing label
        Received:
          0]
      `)
  })

  test('toContainOneByLabelText throws when no elements match', () => {
    expect(() => expect(container).toContainOneByLabelText('Missing label'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByLabelText(label text)

        Expected element to contain one descendant by label text:
          Missing label
        Received:
          0]
      `)
  })

  test('passes selector option through to the query', () => {
    expect(container).toContainOneByLabelText('Full name', {selector: 'input'})
    expect(container).not.toContainOneByLabelText('Full name', {
      selector: 'select',
    })
  })

  test('.not.toContainOneByLabelText throws when exactly one element matches', () => {
    expect(() => expect(container).not.toContainOneByLabelText('Full name'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).not.toContainOneByLabelText(label text)

        Expected element not to contain one descendant by label text:
          Full name
        Received:
          1

        Here are the matching elements:

        [36m<input[39m
          [33mdata-testid[39m=[32m"input"[39m
          [33mid[39m=[32m"name"[39m
          [33mplaceholder[39m=[32m"Enter name"[39m
        [36m/>[39m]
      `)
  })
})

describe('.toContainAnyByPlaceholderText / .toContainOneByPlaceholderText', () => {
  const {container} = render(`
    <input id="name" data-testid="input" placeholder="Enter name" />
  `)

  test('passes when one element matches', () => {
    expect(container).toContainAnyByPlaceholderText('Enter name')
    expect(container).toContainOneByPlaceholderText('Enter name')
  })

  test('fails with .not when no elements match', () => {
    expect(container).not.toContainAnyByPlaceholderText('Missing')
    expect(container).not.toContainOneByPlaceholderText('Missing')
  })

  test('toContainAnyByPlaceholderText throws when no elements match', () => {
    expect(() => expect(container).toContainAnyByPlaceholderText('Missing'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainAnyByPlaceholderText(placeholder text)

        Expected element to contain any descendant by placeholder text:
          Missing
        Received:
          0]
      `)
  })

  test('toContainOneByPlaceholderText throws when no elements match', () => {
    expect(() => expect(container).toContainOneByPlaceholderText('Missing'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByPlaceholderText(placeholder text)

        Expected element to contain one descendant by placeholder text:
          Missing
        Received:
          0]
      `)
  })

  test('.not.toContainOneByPlaceholderText throws when exactly one element matches', () => {
    expect(() =>
      expect(container).not.toContainOneByPlaceholderText('Enter name'),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: expect(element).not.toContainOneByPlaceholderText(placeholder text)

      Expected element not to contain one descendant by placeholder text:
        Enter name
      Received:
        1

      Here are the matching elements:

      [36m<input[39m
        [33mdata-testid[39m=[32m"input"[39m
        [33mid[39m=[32m"name"[39m
        [33mplaceholder[39m=[32m"Enter name"[39m
      [36m/>[39m]
    `)
  })
})

describe('.toContainAnyByRole / .toContainOneByRole', () => {
  const {container} = render(`
    <div role="alert" data-testid="alert">Something went wrong.</div>
    <h1 title="Page title" data-testid="heading">Welcome</h1>
  `)

  test('passes when one element matches', () => {
    expect(container).toContainAnyByRole('alert')
    expect(container).toContainOneByRole('alert')
  })

  test('fails with .not when no elements match', () => {
    expect(container).not.toContainAnyByRole('dialog')
    expect(container).not.toContainOneByRole('dialog')
  })

  test('toContainAnyByRole throws when no elements match', () => {
    expect(() => expect(container).toContainAnyByRole('dialog'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainAnyByRole(role)

        Expected element to contain any descendant by role:
          dialog
        Received:
          0]
      `)
  })

  test('toContainOneByRole throws when no elements match', () => {
    expect(() => expect(container).toContainOneByRole('dialog'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByRole(role)

        Expected element to contain one descendant by role:
          dialog
        Received:
          0]
      `)
  })

  test('toContainOneByRole throws when multiple elements match', () => {
    const {container: multipleContainer} = render(`
      <div role="listitem">A</div>
      <div role="listitem">B</div>
    `)
    expect(multipleContainer).toContainAnyByRole('listitem')
    expect(() => expect(multipleContainer).toContainOneByRole('listitem'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByRole(role)

        Expected element to contain one descendant by role:
          listitem
        Received:
          2

        Here are the matching elements:

        [36m<div[39m
          [33mrole[39m=[32m"listitem"[39m
        [36m>[39m
          [0mA[0m
        [36m</div>[39m

        [36m<div[39m
          [33mrole[39m=[32m"listitem"[39m
        [36m>[39m
          [0mB[0m
        [36m</div>[39m]
      `)
  })

  test('passes role option through to the query', () => {
    expect(container).toContainOneByRole('heading', {name: 'Welcome'})
    expect(container).not.toContainOneByRole('heading', {name: 'Other text'})
  })

  test('toContainOneByRole throws with options in the hint', () => {
    expect(() =>
      expect(container).toContainOneByRole('heading', {name: 'Missing'}),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: expect(element).toContainOneByRole(role, Object {
        "name": "Missing",
      })

      Expected element to contain one descendant by role:
        heading
      Received:
        0]
    `)
  })

  test('.not.toContainOneByRole throws when exactly one element matches', () => {
    expect(() => expect(container).not.toContainOneByRole('alert'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).not.toContainOneByRole(role)

        Expected element not to contain one descendant by role:
          alert
        Received:
          1

        Here are the matching elements:

        [36m<div[39m
          [33mdata-testid[39m=[32m"alert"[39m
          [33mrole[39m=[32m"alert"[39m
        [36m>[39m
          [0mSomething went wrong.[0m
        [36m</div>[39m]
      `)
  })
})

describe('.toContainAnyByTestId / .toContainOneByTestId', () => {
  const {container} = render(`
    <div data-testid="alert" role="alert">Something went wrong.</div>
  `)

  test('passes when one element matches', () => {
    expect(container).toContainAnyByTestId('alert')
    expect(container).toContainOneByTestId('alert')
  })

  test('fails with .not when no elements match', () => {
    expect(container).not.toContainAnyByTestId('missing')
    expect(container).not.toContainOneByTestId('missing')
  })

  test('toContainAnyByTestId throws when no elements match', () => {
    expect(() => expect(container).toContainAnyByTestId('missing'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainAnyByTestId(test ID)

        Expected element to contain any descendant by test ID:
          missing
        Received:
          0]
      `)
  })

  test('toContainOneByTestId throws when no elements match', () => {
    expect(() => expect(container).toContainOneByTestId('missing'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByTestId(test ID)

        Expected element to contain one descendant by test ID:
          missing
        Received:
          0]
      `)
  })

  test('.not.toContainOneByTestId throws when exactly one element matches', () => {
    expect(() => expect(container).not.toContainOneByTestId('alert'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).not.toContainOneByTestId(test ID)

        Expected element not to contain one descendant by test ID:
          alert
        Received:
          1

        Here are the matching elements:

        [36m<div[39m
          [33mdata-testid[39m=[32m"alert"[39m
          [33mrole[39m=[32m"alert"[39m
        [36m>[39m
          [0mSomething went wrong.[0m
        [36m</div>[39m]
      `)
  })

  test('throws when container is not a valid HTML element', () => {
    expect(() => expect(null).toContainAnyByTestId('alert'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(received).toContainAnyByTestId()

        received value must be an HTMLElement or an SVGElement.
        Received has type:  Null
        Received has value: null]
      `)
  })
})

describe('.toContainAnyByText / .toContainOneByText', () => {
  const {container} = render(`<span data-testid="span">Hello world</span>`)

  test('passes when one element matches', () => {
    expect(container).toContainAnyByText('Hello world')
    expect(container).toContainOneByText('Hello world')
  })

  test('fails with .not when no elements match', () => {
    expect(container).not.toContainAnyByText('Goodbye world')
    expect(container).not.toContainOneByText('Goodbye world')
  })

  test('toContainAnyByText throws when no elements match', () => {
    expect(() => expect(container).toContainAnyByText(/Goodbye/i))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainAnyByText(text)

        Expected element to contain any descendant by text:
          /Goodbye/i
        Received:
          0]
      `)
  })

  test('toContainOneByText throws when no elements match', () => {
    expect(() => expect(container).toContainOneByText('Goodbye world'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByText(text)

        Expected element to contain one descendant by text:
          Goodbye world
        Received:
          0]
      `)
  })

  test('passes exact option through to the query', () => {
    expect(container).toContainOneByText('Hello world', {exact: false})
    expect(container).not.toContainOneByText('Hello', {exact: true})
  })

  test('.not.toContainOneByText throws when exactly one element matches', () => {
    expect(() => expect(container).not.toContainOneByText('Hello world'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).not.toContainOneByText(text)

        Expected element not to contain one descendant by text:
          Hello world
        Received:
          1

        Here are the matching elements:

        [36m<span[39m
          [33mdata-testid[39m=[32m"span"[39m
        [36m>[39m
          [0mHello world[0m
        [36m</span>[39m]
      `)
  })
})

describe('.toContainAnyByTitle / .toContainOneByTitle', () => {
  const {container} = render(`
    <h1 title="Page title" data-testid="heading">Welcome</h1>
  `)

  test('passes when one element matches', () => {
    expect(container).toContainAnyByTitle('Page title')
    expect(container).toContainOneByTitle('Page title')
  })

  test('fails with .not when no elements match', () => {
    expect(container).not.toContainAnyByTitle('Missing title')
    expect(container).not.toContainOneByTitle('Missing title')
  })

  test('toContainAnyByTitle throws when no elements match', () => {
    expect(() => expect(container).toContainAnyByTitle('Missing title'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainAnyByTitle(title)

        Expected element to contain any descendant by title:
          Missing title
        Received:
          0]
      `)
  })

  test('toContainOneByTitle throws when no elements match', () => {
    expect(() => expect(container).toContainOneByTitle('Missing title'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).toContainOneByTitle(title)

        Expected element to contain one descendant by title:
          Missing title
        Received:
          0]
      `)
  })

  test('.not.toContainOneByTitle throws when exactly one element matches', () => {
    expect(() => expect(container).not.toContainOneByTitle('Page title'))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: expect(element).not.toContainOneByTitle(title)

        Expected element not to contain one descendant by title:
          Page title
        Received:
          1

        Here are the matching elements:

        [36m<h1[39m
          [33mdata-testid[39m=[32m"heading"[39m
          [33mtitle[39m=[32m"Page title"[39m
        [36m>[39m
          [0mWelcome[0m
        [36m</h1>[39m]
      `)
  })
})
