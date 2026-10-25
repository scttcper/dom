/**
 * `toMatchAriaSnapshot`: an @ctrl/dom addition to jest-dom (upstream has no such matcher), with
 * the semantics of Playwright's aria snapshot assertion over our `ariaSnapshot` model.
 *
 * Specs:
 * - Playwright aria snapshots — https://playwright.dev/docs/aria-snapshots
 *   (#partial-matching, #matching-with-regular-expressions, #strict-matching, #aria-snapshot-yaml)
 * - Playwright 1.56 sources the matching is ported from: packages/injected/src/ariaSnapshot.ts
 *   (`matchesNode`, `containsList`, `listEqual`) and
 *   packages/playwright-core/src/utils/isomorphic/ariaSnapshot.ts (`KeyParser`).
 *
 * Runs on @ctrl/dom with our matchers only (the stock jest-dom oracle has no counterpart).
 */
import { stripVTControlCharacters } from "node:util";
import { describe, expect, test } from "vitest";
import { ariaSnapshot } from "@ctrl/dom/testing-library";

const ours = process.env.JEST_DOM_IMPL !== "stock" && process.env.CTRL_DOM_STACK !== "jsdom";

function render(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

/** The failure message without ANSI colors. */
function failure(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    return stripVTControlCharacters((error as Error).message);
  }
  throw new Error("expected the assertion to fail");
}

const CHECKOUT = `
  <header><nav aria-label="Main"><a href="/">Home</a><a href="/cart" aria-current="page">Cart</a></nav></header>
  <main>
    <h1>Checkout</h1>
    <form aria-label="Payment">
      <label>Email <input type="email" value="ada@example.com"></label>
      <label><input type="checkbox" checked> Remember me</label>
      <label><input type="checkbox"> Newsletter</label>
      <button aria-expanded="false">Options</button>
      <button disabled>Pay 42 €</button>
    </form>
    <ul><li>One</li><li>Two</li><li>Three</li></ul>
    <p>Total: 3 items</p>
  </main>`;

describe.skipIf(!ours)("partial matching — https://playwright.dev/docs/aria-snapshots#partial-matching", () => {
  test("a template listing a subset of the children, in order, matches", () => {
    render(CHECKOUT);
    expect(document.body).toMatchAriaSnapshot(`
      - main:
        - heading "Checkout" [level=1]
        - list:
          - listitem: Three
    `);
  });

  test("children out of order do not match (containsList is an ordered subsequence)", () => {
    render(CHECKOUT);
    expect(document.body).not.toMatchAriaSnapshot(`
      - list:
        - listitem: Two
        - listitem: One
    `);
  });

  test("the template's root matches any node in the tree, at any depth", () => {
    render(CHECKOUT);
    expect(document.body).toMatchAriaSnapshot(`- link "Cart" [current=page]`);
    expect(document.body).toMatchAriaSnapshot(`- button "Options"`);
  });

  test("several top-level items match the children of one node, in order", () => {
    render(CHECKOUT);
    expect(document.body).toMatchAriaSnapshot(`
      - checkbox "Remember me"
      - button "Pay 42 €"
    `);
    // The heading and the checkbox have different parents.
    expect(document.body).not.toMatchAriaSnapshot(`
      - heading "Checkout"
      - checkbox "Remember me"
    `);
  });

  test("a node without a name in the template matches any name", () => {
    render(CHECKOUT);
    expect(document.body).toMatchAriaSnapshot(`
      - form:
        - textbox
        - button [disabled]
    `);
  });

  test("an element container matches as itself; body, document and fragments by their children", () => {
    render(CHECKOUT);
    const form = document.querySelector("form")!;
    expect(form).toMatchAriaSnapshot(`- form "Payment"`);
    expect(document).toMatchAriaSnapshot(`- heading "Checkout"`);
    expect(form).not.toMatchAriaSnapshot(`- heading "Checkout"`);
  });

  test("an empty tree matches nothing", () => {
    render(`<div></div>`);
    expect(document.body).not.toMatchAriaSnapshot(`- button`);
  });
});

describe.skipIf(!ours)(
  "names and text — https://playwright.dev/docs/aria-snapshots#matching-with-regular-expressions",
  () => {
    test("a string name matches the whole accessible name, whitespace-normalized", () => {
      render(`<button>  Save   draft </button>`);
      expect(document.body).toMatchAriaSnapshot(`- button "Save draft"`);
      expect(document.body).not.toMatchAriaSnapshot(`- button "Save"`);
    });

    test("a /regex/ name matches by RegExp#test", () => {
      render(CHECKOUT);
      expect(document.body).toMatchAriaSnapshot(`- button /Pay \\d+ €/`);
      expect(document.body).not.toMatchAriaSnapshot(`- button /^Pay$/`);
    });

    test("`role: text` matches a node whose content is that text; `- text:` matches a text run", () => {
      render(`<p>Hello <b>world</b></p><div>Loose <span>inline</span> text<div>block</div></div>`);
      expect(document.body).toMatchAriaSnapshot(`
      - paragraph: Hello world
      - text: Loose inline text
    `);
      expect(document.body).not.toMatchAriaSnapshot(`- paragraph: Hello`);
    });

    test("text values may be /regex/", () => {
      render(CHECKOUT);
      expect(document.body).toMatchAriaSnapshot(`- paragraph: /Total: \\d+ items/`);
    });

    test("a textbox's value is its text content, as Playwright models it", () => {
      render(CHECKOUT);
      expect(document.body).toMatchAriaSnapshot(`- textbox "Email": ada@example.com`);
      expect(document.body).not.toMatchAriaSnapshot(`- textbox "Email": grace@example.com`);
    });

    test("keys may be YAML-quoted, names may contain escaped quotes, values may be quoted", () => {
      render(
        `<a href="/x">a: b</a><button aria-label='Say "hi"'>x</button><input aria-label="Count" type="number" value="3">`,
      );
      expect(document.body).toMatchAriaSnapshot(`
      - 'link "a: b"'
      - "button \\"Say \\\\\\"hi\\\\\\"\\"": x
      - spinbutton "Count": "3"
    `);
    });
  },
);

describe.skipIf(!ours)("states — https://playwright.dev/docs/aria-snapshots#aria-snapshot-yaml", () => {
  test("listed states must match; unlisted ones are ignored", () => {
    render(CHECKOUT);
    expect(document.body).toMatchAriaSnapshot(`
      - checkbox "Remember me" [checked]
      - checkbox "Newsletter" [checked=false]
      - button "Options" [expanded=false]
      - button "Pay 42 €" [disabled]
    `);
    expect(document.body).not.toMatchAriaSnapshot(`- checkbox "Newsletter" [checked]`);
    expect(document.body).not.toMatchAriaSnapshot(`- button "Options" [expanded]`);
    expect(document.body).not.toMatchAriaSnapshot(`- button "Options" [disabled]`);
  });

  test("[disabled=false] matches an enabled control; [expanded=false] needs aria-expanded", () => {
    render(`<button>Plain</button>`);
    expect(document.body).toMatchAriaSnapshot(`- button "Plain" [disabled=false]`);
    expect(document.body).not.toMatchAriaSnapshot(`- button "Plain" [expanded=false]`);
  });

  test("[level=N], [pressed], [selected], [current] and [active]", () => {
    render(
      `<h3>Sub</h3><button aria-pressed="true">Bold</button><div role="tablist"><div role="tab" aria-selected="true">A</div></div><a href="/" aria-current="page">Home</a><input aria-label="Name">`,
    );
    (document.querySelector("input") as any).focus();
    expect(document.body).toMatchAriaSnapshot(`
      - heading "Sub" [level=3]
      - button "Bold" [pressed]
      - tablist:
        - tab "A" [selected]
      - link "Home" [current]
      - textbox "Name" [active]
    `);
    expect(document.body).not.toMatchAriaSnapshot(`- heading "Sub" [level=2]`);
    expect(document.body).toMatchAriaSnapshot(`- link "Home" [current=page]`);
  });
});

describe.skipIf(!ours)(
  "strict matching and properties — https://playwright.dev/docs/aria-snapshots#strict-matching",
  () => {
    test("`/children: equal` requires exactly the listed children; `contain` is the default", () => {
      render(`<ul><li>One</li><li>Two</li></ul>`);
      expect(document.body).toMatchAriaSnapshot(`
      - list:
        - /children: equal
        - listitem: One
        - listitem: Two
    `);
      expect(document.body).not.toMatchAriaSnapshot(`
      - list:
        - /children: equal
        - listitem: One
    `);
    });

    test("`/children: deep-equal` applies to every level below", () => {
      render(`<ul><li>One <b role="img" aria-label="star"></b></li></ul>`);
      expect(document.body).toMatchAriaSnapshot(`
      - list:
        - /children: equal
        - listitem:
          - text: One
    `);
      expect(document.body).not.toMatchAriaSnapshot(`
      - list:
        - /children: deep-equal
        - listitem:
          - text: One
    `);
    });

    test("`- /url:` matches a link's href", () => {
      render(`<a href="/docs/intro">Docs</a>`);
      expect(document.body).toMatchAriaSnapshot(`
      - link "Docs":
        - /url: /docs/intro
    `);
      expect(document.body).toMatchAriaSnapshot(`
      - link "Docs":
        - /url: /\\/docs\\//
    `);
      expect(document.body).not.toMatchAriaSnapshot(`
      - link "Docs":
        - /url: /blog
    `);
    });

    test("a snapshot printed with collapsing off is a template that matches its own tree", () => {
      render(CHECKOUT);
      const snapshot = ariaSnapshot(document.body, { collapseAfter: Infinity, urls: true });
      expect(document.body).toMatchAriaSnapshot(snapshot);
      expect(document.querySelector("main")!).toMatchAriaSnapshot(
        ariaSnapshot(document.querySelector("main")!, { collapseAfter: Infinity }),
      );
    });
  },
);

describe.skipIf(!ours)("failure messages", () => {
  test("a mismatch diffs the template against the closest part of the tree, then prints the tree", () => {
    render(
      `<main><h1>Checkout</h1><form aria-label="Payment"><input aria-label="Email"><button>Pay now</button></form></main>`,
    );
    expect(
      failure(() =>
        expect(document.body).toMatchAriaSnapshot(`
          - form "Payment":
            - textbox "Email"
            - button "Submit"
        `),
      ),
    ).toMatchInlineSnapshot(`
      "expect(element).toMatchAriaSnapshot(template)

      - Expected  - 1  (template)
      + Received  + 1  (closest part of the accessibility tree)

        - form "Payment":
          - textbox "Email"
      -   - button "Submit"
      +   - button "Pay now"

      Received accessibility tree:
      - main:
        - heading "Checkout" [level=1]
        - form "Payment":
          - textbox "Email"
          - button "Pay now""
    `);
  });

  test("states and text that differ show the node as it is", () => {
    render(`<ul><li>One</li><li>Two</li></ul><input type="checkbox" aria-label="Agree">`);
    expect(
      failure(() =>
        expect(document.body).toMatchAriaSnapshot(`
          - list:
            - listitem: One
            - listitem: Three
          - checkbox "Agree" [checked]
        `),
      ),
    ).toMatchInlineSnapshot(`
      "expect(element).toMatchAriaSnapshot(template)

      - Expected  - 2  (template)
      + Received  + 2  (closest part of the accessibility tree)

        - list:
          - listitem: One
      -   - listitem: Three
      +   - listitem: Two
      - - checkbox "Agree" [checked]
      + - checkbox "Agree"

      Received accessibility tree:
      - list:
        - listitem: One
        - listitem: Two
      - checkbox "Agree""
    `);
  });

  test("nothing alike prints the whole template as missing", () => {
    render(`<p>Hi</p>`);
    expect(failure(() => expect(document.body).toMatchAriaSnapshot(`- button "Go"`))).toContain(
      '- Expected  - 1  (template)\n+ Received  + 0  (closest part of the accessibility tree)\n\n- - button "Go"\n',
    );
  });

  test(".not prints the template and the tree", () => {
    render(`<button>Go</button>`);
    expect(failure(() => expect(document.body).not.toMatchAriaSnapshot(`- button`))).toMatchInlineSnapshot(`
      "expect(element).not.toMatchAriaSnapshot(template)

      Expected the accessibility tree not to match the template:
      - button

      Received:
      - button "Go""
    `);
  });

  test("an invalid template throws with the line and a caret", () => {
    render(`<button>Go</button>`);
    expect(() => expect(document.body).toMatchAriaSnapshot(`- button [bogus]`)).toThrowErrorMatchingInlineSnapshot(`
      [AriaTemplateError: Unsupported attribute [bogus] (template line 1):

      - button [bogus]
                ^]
    `);
    expect(() => expect(document.body).toMatchAriaSnapshot(`button "Go"`)).toThrow(
      /Aria snapshot must be a YAML sequence, elements starting with "-" \(template line 1\)/,
    );
    expect(() => expect(document.body).toMatchAriaSnapshot(`- button [checked=yes]`)).toThrow(
      /Value of "checked" attribute must be a boolean or "mixed"/,
    );
    expect(() => expect(document.body).toMatchAriaSnapshot(`- button "Go`)).toThrow(/Unterminated string/);
    expect(() => expect(document.body).toMatchAriaSnapshot(`\n  \n`)).toThrow(/template is empty/);
    expect(() => expect(document.body).toMatchAriaSnapshot(`- text: a\n  - button`)).toThrow(/cannot have children/);
  });

  test("a value that is not a node, or a template that is not a string, throws", () => {
    expect(() => expect({}).toMatchAriaSnapshot(`- button`)).toThrow(/received value must be a Node/);
    expect(() => expect(document.body).toMatchAriaSnapshot(undefined as any)).toThrow(
      /expects an aria snapshot template string, got undefined/,
    );
  });
});
