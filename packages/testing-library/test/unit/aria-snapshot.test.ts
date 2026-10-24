/**
 * `ariaSnapshot`: the accessibility tree as Playwright aria snapshot YAML (an @ctrl/dom
 * addition for agent-oriented debugging, docs/agent-debugging.md).
 *
 * Specs:
 * - Playwright aria snapshot format — https://playwright.dev/docs/aria-snapshots
 *   (`- role "name" [attr]` keys, `: text` values, `- text:` runs, `- /url:` props)
 * - Accessible name computation — https://w3c.github.io/accname/#mapping_additional_nd_name
 * - HTML element role mappings — https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings
 * - HTML attribute state mappings — https://www.w3.org/TR/html-aam-1.0/#html-attribute-state-and-property-mappings
 * - Accessibility tree exclusion — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion
 *
 * Roles, names and hiddenness come from the same @rtd/aria functions `*ByRole` uses, so the last
 * block checks the snapshot against the queries themselves.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { ariaSnapshot, getAllByRole, getByRole, screen } from "../../src/index.ts";

function render(html: string): any {
  document.body.innerHTML = html;
  return document.body;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("snapshot format — https://playwright.dev/docs/aria-snapshots", () => {
  test("each node is `- role \"name\"`, children are indented two spaces under `key:`", () => {
    render(`<nav aria-label="Main"><ul><li><a href="/">Home</a></li></ul></nav>`);
    expect(ariaSnapshot()).toBe(['- navigation "Main":', "  - list:", "    - listitem:", '      - link "Home"'].join("\n"));
  });

  test("a node whose only content is text prints it after the colon; text equal to the name is dropped", () => {
    render(`<p>Hello <b>world</b></p><button>Save</button>`);
    expect(ariaSnapshot()).toBe(['- paragraph: Hello world', '- button "Save"'].join("\n"));
  });

  test("text next to element children prints as `- text:` runs; block wrappers end a run", () => {
    render(`<div>Loose <span>inline</span> text<div>block</div></div>`);
    expect(ariaSnapshot()).toBe(["- text: Loose inline text", "- text: block"].join("\n"));
  });

  test("names are JSON-quoted; values are quoted when plain YAML would misread them; text that differs from the name is kept", () => {
    render(`<button aria-label='Say "hi"'>x</button><input aria-label="Count" type="number" value="3"><p>a: b</p>`);
    expect(ariaSnapshot()).toBe(['- button "Say \\"hi\\"": x', '- spinbutton "Count": "3"', '- paragraph: "a: b"'].join("\n"));
  });

  test("link targets print as `- /url:` children only with { urls: true }", () => {
    render(`<a href="/docs">Docs</a>`);
    expect(ariaSnapshot()).toBe('- link "Docs"');
    expect(ariaSnapshot(document.body, { urls: true })).toBe(['- link "Docs":', "  - /url: /docs"].join("\n"));
  });

  test("an element container prints itself; body, document and fragments print their children", () => {
    render(`<form aria-label="Login"><button>Go</button></form>`);
    expect(ariaSnapshot(document.querySelector("form"))).toBe(['- form "Login":', '  - button "Go"'].join("\n"));
    expect(ariaSnapshot(document)).toBe(ariaSnapshot(document.body));
    expect(screen.ariaSnapshot()).toBe(ariaSnapshot(document.body));
    const fragment = document.createDocumentFragment();
    fragment.append(document.createElement("hr"));
    expect(ariaSnapshot(fragment)).toBe("- separator");
  });

  test("an empty tree says so", () => {
    render(`<div></div>`);
    expect(ariaSnapshot()).toBe("# no accessible content");
  });
});

describe("roles — https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings", () => {
  test("elements without a role (generic, none, presentation, SVG internals) are skipped and their children hoisted", () => {
    render(`<div class="card"><span role="presentation"><button><svg viewBox="0 0 2 2"><path d="M0 0"/></svg>Add</button></span></div>`);
    expect(ariaSnapshot()).toBe('- button "Add"');
  });

  test("an explicit role's first token wins over the implicit role", () => {
    render(`<div role="tab button" aria-selected="true">One</div>`);
    expect(ariaSnapshot()).toBe('- tab "One" [selected]');
  });

  test("script, style and template contents are not part of the tree", () => {
    render(`<style>p{}</style><script>1</script><template><p>x</p></template><p>shown</p>`);
    expect(ariaSnapshot()).toBe("- paragraph: shown");
  });
});

describe("accessible names — https://w3c.github.io/accname/#mapping_additional_nd_name", () => {
  test("form controls are named by their label; the label's own text is not repeated", () => {
    render(`<label>Email <input type="email" value="ada@example.com"></label><label for="n">Notes</label><textarea id="n">hi</textarea>`);
    expect(ariaSnapshot()).toBe(['- textbox "Email": ada@example.com', '- textbox "Notes": hi'].join("\n"));
  });

  test("aria-labelledby and aria-label name widgets; names are whitespace-collapsed", () => {
    render(`<h2 id="t">Billing   address</h2><section aria-labelledby="t"><input aria-label="Street"></section>`);
    expect(ariaSnapshot()).toBe(['- heading "Billing address" [level=2]', '- region "Billing address":', '  - textbox "Street"'].join("\n"));
  });
});

describe("states and properties — https://www.w3.org/TR/html-aam-1.0/#html-attribute-state-and-property-mappings", () => {
  test("checked, mixed, disabled, expanded, pressed, selected, level and current", () => {
    render(`
      <input type="checkbox" aria-label="A" checked>
      <input type="checkbox" aria-label="B" id="mixed">
      <input type="checkbox" aria-label="C">
      <button disabled>D</button>
      <button aria-expanded="true">E</button>
      <button aria-expanded="false">F</button>
      <button aria-pressed="true">G</button>
      <button aria-pressed="false">H</button>
      <select aria-label="I"><option>x</option><option selected>y</option></select>
      <h3>J</h3>
      <a href="/" aria-current="page">K</a>
      <div role="treeitem" aria-level="2" aria-busy="true">L</div>`);
    (document.getElementById("mixed") as any).indeterminate = true;
    expect(ariaSnapshot()).toBe(
      [
        '- checkbox "A" [checked]',
        '- checkbox "B" [checked=mixed]',
        '- checkbox "C"',
        '- button "D" [disabled]',
        '- button "E" [expanded]',
        '- button "F" [expanded=false]',
        '- button "G" [pressed]',
        '- button "H" [pressed=false]',
        '- combobox "I":',
        '  - option "x"',
        '  - option "y" [selected]',
        '- heading "J" [level=3]',
        '- link "K" [current=page]',
        '- treeitem "L" [level=2] [busy]',
      ].join("\n"),
    );
  });

  test("the focused element is marked [active]; a focused body is not", () => {
    render(`<input aria-label="Name"><button>Go</button>`);
    expect(ariaSnapshot()).not.toContain("[active]");
    (document.querySelector("input") as any).focus();
    expect(ariaSnapshot()).toBe(['- textbox "Name" [active]', '- button "Go"'].join("\n"));
  });

  test("slider and progressbar values come from aria-valuetext, aria-valuenow or the input value", () => {
    render(`<input type="range" aria-label="Volume" value="30"><div role="progressbar" aria-label="Upload" aria-valuenow="40" aria-valuetext="40 percent"></div>`);
    expect(ariaSnapshot()).toBe(['- slider "Volume": "30"', '- progressbar "Upload": 40 percent'].join("\n"));
  });

  test("a password input has no role (aria-query), so like ByRole the snapshot leaves it out", () => {
    render(`<input type="password" aria-label="Password" value="hunter2">`);
    expect(ariaSnapshot()).toBe("# no accessible content");
  });
});

describe("accessibility tree exclusion — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion", () => {
  const HIDDEN = `<button>Visible</button><div aria-hidden="true"><button>Aria</button></div><div hidden><button>Attr</button></div><div style="display:none"><button>None</button></div><div style="visibility:hidden">gone<button style="visibility:visible">Back</button></div>`;

  test("hidden, aria-hidden and display:none subtrees are left out; visibility:hidden leaves out the element, not a visible descendant", () => {
    render(HIDDEN);
    expect(ariaSnapshot()).toBe(['- button "Visible"', '- button "Back"'].join("\n"));
  });

  test("{ hidden: true } includes them, marked [hidden]", () => {
    render(HIDDEN);
    expect(ariaSnapshot(document.body, { hidden: true })).toBe(
      ['- button "Visible"', '- button "Aria" [hidden]', '- button "Attr" [hidden]', '- button "None" [hidden]', "- text: gone", '- button "Back"'].join("\n"),
    );
  });

  test("a container inside an excluded subtree still prints, with the reason", () => {
    render(HIDDEN);
    expect(ariaSnapshot(document.querySelector("[aria-hidden] button"))).toBe(
      ['# hidden from the accessibility tree: aria-hidden="true" on <div>', '- button "Aria" [hidden]'].join("\n"),
    );
  });

  test("a tree with only hidden content points at { hidden: true }", () => {
    render(`<div hidden><p>x</p></div>`);
    expect(ariaSnapshot()).toBe("# no accessible content (hidden elements exist: pass { hidden: true })");
  });
});

describe("budgets", () => {
  test("runs of more than `collapseAfter` same-role siblings print the first ones and a (+N more) line", () => {
    render(`<ul>${Array.from({ length: 48 }, (_, i) => `<li>Item ${i}</li>`).join("")}</ul>`);
    expect(ariaSnapshot(document.body, { collapseAfter: 2 })).toBe(["- list:", "  - listitem: Item 0", "  - listitem: Item 1", "  - listitem … (+46 more)"].join("\n"));
    expect(ariaSnapshot(document.body, { collapseAfter: Infinity }).split("\n")).toHaveLength(49);
  });

  test("a run only one longer than `collapseAfter` is printed in full", () => {
    render(`<ul>${Array.from({ length: 3 }, (_, i) => `<li>Item ${i}</li>`).join("")}</ul>`);
    expect(ariaSnapshot(document.body, { collapseAfter: 2 }).split("\n")).toHaveLength(4);
  });

  test("long names and text are truncated with an ellipsis", () => {
    render(`<button>${"a".repeat(30)}</button>`);
    expect(ariaSnapshot(document.body, { maxTextLength: 10 })).toBe('- button "aaaaaaaaa…"');
  });

  test("past maxLines the rest is one `# … N more lines` comment", () => {
    render(Array.from({ length: 10 }, (_, i) => `<h2>H${i}</h2>`).join(""));
    const out = ariaSnapshot(document.body, { maxLines: 3, collapseAfter: Infinity }).split("\n");
    expect(out).toEqual(['- heading "H0" [level=2]', '- heading "H1" [level=2]', '- heading "H2" [level=2]', "# … 7 more lines (raise maxLines or CTRL_DOM_DEBUG_LINES)"]);
  });
});

describe("agreement with *ByRole", () => {
  test("every named node in the snapshot is found by getByRole(role, { name }) and vice versa", () => {
    render(`
      <header><nav aria-label="Main"><a href="/a">A</a><a href="/b" aria-current="page">B</a></nav></header>
      <main><h1>Title</h1><form aria-label="F"><label>User <input></label><label><input type="checkbox"> Keep</label>
      <button type="submit">Send</button><div aria-hidden="true"><button>Ghost</button></div></form>
      <table><tr><th>Col</th></tr><tr><td>Cell</td></tr></table></main>`);
    const snapshot = ariaSnapshot(document.body, { collapseAfter: Infinity });
    const named = [...snapshot.matchAll(/^\s*- ([a-z]+) "([^"]*)"/gm)];
    expect(named.length).toBeGreaterThan(8);
    for (const [, role, name] of named) expect(getByRole(document.body, role, { name })).toBeTruthy();
    // And the other direction: every accessible element with a non-generic role is in the snapshot.
    for (const role of ["navigation", "link", "heading", "form", "textbox", "checkbox", "button", "table", "row", "columnheader", "cell"]) {
      for (const el of getAllByRole(document.body, role)) {
        expect(snapshot).toContain(`- ${role}`);
        expect(el).toBeTruthy();
      }
    }
    expect(snapshot).not.toContain("Ghost");
  });
});
