/**
 * The fast DOM printer in src/pretty-dom.ts must produce byte-identical output to upstream's
 * `prettyFormat.format(dom, {plugins: [DOMElementFilter(filterNode), DOMCollection], ...})`
 * (https://github.com/testing-library/dom-testing-library/blob/main/src/pretty-dom.js), without
 * pretty-format, which @ctrl/dom does not install. This runs both on the same nodes (@ctrl/dom's,
 * jsdom's and happy-dom's) over many fixtures and option combinations, themes included, and
 * checks invalid options throw pretty-format 27's exact errors.
 */

import { Window as HappyWindow } from "happy-dom";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  formatWithFastPrinter,
  formatWithPrettyFormat,
  filterCommentsAndDefaultIgnoreTagsTags,
} from "../../src/pretty-dom.ts";

const FIXTURES: Record<string, string> = {
  empty: "",
  text: "Hello World!",
  nested: "<div><p>a<b>b</b>c</p><span></span></div>",
  attributes: `<input type="text" value="x" data-b="2" data-a="1" aria-label='say "hi"' class="a\\b">`,
  whitespace: "<div>\n  <p>\n    text\n  </p>\n</div>",
  comments: "<div><!-- c1 --><p>x</p><!--c2--></div>",
  scriptStyle: `<div><script>if (a < b) {}</script><style>a > b {}</style><p>y</p></div>`,
  escaping: '<p>1 &lt; 2 &gt; 0 &amp; "q"</p>',
  svg: `<svg viewBox="0 0 10 10"><linearGradient id="g"></linearGradient><foreignObject><div>x</div></foreignObject></svg>`,
  custom: `<my-element is-big="true"><span>x</span></my-element><div is="x-div"></div>`,
  emptyText: "<p></p>",
  deep: "<div><div><div><div><div><span>deep</span></div></div></div></div></div>",
  form: `<form><label for="a">A</label><input id="a"><select><option selected>1</option></select><textarea>t</textarea><button disabled>b</button></form>`,
  table: "<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
  unicode: "<p title='ü&nbsp;—'>日本語   emoji 😀</p>",
};

const OPTIONS: Record<string, Record<string, unknown>> = {
  default: { printFunctionName: false, highlight: false },
  highlight: { printFunctionName: false, highlight: true },
  min: { printFunctionName: false, highlight: false, min: true },
  minHighlight: { printFunctionName: false, highlight: true, min: true },
  indent4: { printFunctionName: false, highlight: false, indent: 4 },
  indent0: { printFunctionName: false, highlight: false, indent: 0 },
  maxDepth1: { printFunctionName: false, highlight: false, maxDepth: 1 },
  maxDepth3: { printFunctionName: false, highlight: true, maxDepth: 3 },
  noEscape: { printFunctionName: false, highlight: false, escapeString: false },
};

const FILTERS: Record<string, ((node: any) => boolean) | undefined> = {
  defaultFilter: undefined,
  keepAll: () => true,
  dropText: (node: any) => node.nodeType !== 3,
};

describe("fast DOM printer ≡ pretty-format + DOMElementFilter", () => {
  for (const [fixture, html] of Object.entries(FIXTURES)) {
    for (const [optName, options] of Object.entries(OPTIONS)) {
      for (const [filterName, filter] of Object.entries(FILTERS)) {
        test(`${fixture} / ${optName} / ${filterName}`, () => {
          const container = document.createElement("div");
          container.innerHTML = html;
          const fast = formatWithFastPrinter(container, filter, options);
          const oracle = formatWithPrettyFormat(container, filter ?? filterCommentsAndDefaultIgnoreTagsTags, options);
          expect(fast).not.toBeNull();
          expect(fast).toBe(oracle);
        });
      }
    }
  }

  test("DocumentFragment", () => {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(document.createElement("b")).textContent = "x";
    fragment.appendChild(document.createTextNode("y"));
    const options = { printFunctionName: false, highlight: false };
    expect(formatWithFastPrinter(fragment, undefined, options)).toBe(
      formatWithPrettyFormat(fragment, filterCommentsAndDefaultIgnoreTagsTags, options),
    );
  });

  test("only a custom plugins option still needs pretty-format (it replaces the DOM plugins)", () => {
    expect(formatWithFastPrinter(document.createElement("div"), undefined, { plugins: [] })).toBeNull();
  });
});

const THEMED = `<div id="a"><!-- c --><p class="x">text</p></div>`;

describe("themes ≡ pretty-format 27's getColorsHighlight (ansi-styles 5 names)", () => {
  const THEMES: Record<string, Record<string, unknown>> = {
    partial: { tag: "red" },
    full: { comment: "bgBlue", content: "bold", prop: "magentaBright", tag: "underline", value: "grey" },
    empty: {},
  };
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const highlight of [true, false]) {
      test(`${name} theme, highlight ${highlight}`, () => {
        const container = document.createElement("div");
        container.innerHTML = THEMED;
        const options = { printFunctionName: false, highlight, theme };
        const filter = () => true;
        expect(formatWithFastPrinter(container, filter, options)).toBe(
          formatWithPrettyFormat(container, filter, options),
        );
      });
    }
  }
});

describe("invalid options throw pretty-format 27's validateOptions / theme errors verbatim", () => {
  const INVALID: Record<string, Record<string, unknown>> = {
    unknownOption: { bogus: 1 },
    minWithIndent: { min: true, indent: 2 },
    nullTheme: { theme: null },
    stringTheme: { theme: "red" },
    unknownColor: { highlight: true, theme: { tag: "nope" } },
    emptyColor: { highlight: true, theme: { tag: "" } },
    inheritedName: { highlight: true, theme: { tag: "toString" } },
  };
  for (const [name, options] of Object.entries(INVALID)) {
    test(name, () => {
      const div = document.createElement("div");
      let expected = "";
      try {
        formatWithPrettyFormat(div, filterCommentsAndDefaultIgnoreTagsTags, options);
      } catch (error) {
        expected = (error as Error).message;
      }
      expect(expected).toMatch(/^pretty-format: /);
      expect(() => formatWithFastPrinter(div, undefined, options)).toThrow(expected);
    });
  }
});

// Another DOM's nodes (a jsdom or happy-dom file under the ctrlDom() plugin) print through the
// public DOM API.
const FOREIGN: Record<string, () => { document: any; close(): void }> = {
  jsdom: () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    return { document: dom.window.document, close: () => dom.window.close() };
  },
  "happy-dom": () => {
    const window = new HappyWindow();
    return { document: window.document, close: () => void window.happyDOM.close() };
  },
};

for (const [domName, open] of Object.entries(FOREIGN)) {
  describe(`${domName} nodes: printer ≡ pretty-format + DOMElementFilter`, () => {
    for (const [fixture, html] of Object.entries(FIXTURES)) {
      test(fixture, () => {
        const { document: foreign, close } = open();
        try {
          const container = foreign.createElement("div");
          container.innerHTML = html;
          for (const options of Object.values(OPTIONS)) {
            for (const filter of Object.values(FILTERS)) {
              const fast = formatWithFastPrinter(container, filter, options);
              expect(fast).not.toBeNull();
              expect(fast).toBe(
                formatWithPrettyFormat(container, filter ?? filterCommentsAndDefaultIgnoreTagsTags, options),
              );
            }
          }
        } finally {
          close();
        }
      });
    }
  });
}
