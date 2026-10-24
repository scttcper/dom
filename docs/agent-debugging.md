# Debugging tests with coding agents

Coding agents (Claude Code, Codex, Cursor and others) fix failing component tests by reading
`screen.debug()` output and Testing Library's error messages. Upstream prints those as
pretty-printed HTML: every class, inline style and SVG path. An agent pays for all of it in
tokens and gets little out of it. A failing `getByRole` on a large page can be half a megabyte.

`@ctrl/dom` adds an output mode for agents. It is opt-in, and without it every output stays
byte-identical to `@testing-library/dom`.

## What you get

- **`ariaSnapshot(container?, options?)`** (also `screen.ariaSnapshot()`): the accessibility
  tree in [Playwright's aria snapshot YAML](https://playwright.dev/docs/aria-snapshots), a
  format models already know. It shows roles, accessible names, the states `*ByRole` filters on,
  textbox and slider values, and text. It is computed with the same role, name and hidden rules
  as `*ByRole` (`@rtd/aria`), so it shows exactly what the queries match.
- **`prettyDOM(el, max, { format })`**: `"pretty"` (upstream), `"aria"` (the snapshot) or
  `"compact"` (HTML without `class`/`style` attributes and SVG internals, without ANSI colors).
  `screen.debug()` and `render().debug()` take the same option.
- **`CTRL_DOM_DEBUG=aria`** (or `compact`): switches `prettyDOM`, `screen.debug()`,
  `render().debug()` and the errors of failing queries to that format, with no code changes.
  Failed `*ByRole`, `*ByText` and `*ByLabelText` queries (including `findBy*` timeouts) also list
  the **closest matches**, which usually point at the fix.
- **`diffAriaSnapshots(before, after)`**: what changed between two snapshots, e.g. after a click.

## Turning it on

Agents should set the variable in the test command they run:

```sh
CTRL_DOM_DEBUG=aria pnpm vitest run src/Checkout.test.tsx
CTRL_DOM_DEBUG=aria npx jest src/Checkout.test.tsx
```

Or turn it on for a whole Vitest project with the plugin (a `CTRL_DOM_DEBUG` set in the shell
still wins):

```ts
plugins: [ctrlDom({ debug: "aria" })],
```

It is **not** turned on from agent environment variables like `CLAUDECODE`. Suites run by agents
(this repository's included) assert upstream's messages, so the mode has to be asked for.
A line for your `CLAUDE.md` / `AGENTS.md`:

> When a component test fails, rerun it with `CTRL_DOM_DEBUG=aria` to get accessibility
> snapshots and closest matches instead of HTML dumps.

| Variable | Values | Effect |
| --- | --- | --- |
| `CTRL_DOM_DEBUG` | `aria`, `compact` (`html` is an alias) | default format for `prettyDOM` / `debug()` / query errors. Any other value is ignored |
| `CTRL_DOM_DEBUG_LINES` | positive number | line budget for snapshots (default 200, 100 inside errors) |

## Before and after

A failing `screen.getByRole("button", { name: "Submit" })` on a small checkout form, where the
"Submit" control is a `<div>` with a click handler.

Upstream (and the default): **2,476 characters**, without ANSI colors:

```
Unable to find an accessible element with the role "button" and name "Submit"

Here are the accessible roles:

  banner:

  Name "":
  <header
    class="flex items-center justify-between px-4"
  />

  --------------------------------------------------
  … (navigation, link, main, heading, form, textbox, button, each with its tag) …

Ignored nodes: comments, script, style
<body>
  <header
    class="flex items-center justify-between px-4"
  >
  … (the whole body as HTML, SVG paths included) …
      <div
        class="cursor-pointer rounded bg-gray-100 px-3 py-2"
      >
        Submit
      </div>
    </form>
  </main>
</body>
```

With `CTRL_DOM_DEBUG=aria`: **468 characters**:

```
Unable to find an accessible element with the role "button" and name "Submit"

Closest matches:
- text: "Submit"  # in <div>, which has no role: give it role="button" or use getByText
- button "Pay now"  # same role, other name

Accessibility snapshot of <body> (CTRL_DOM_DEBUG=aria):
- banner:
  - navigation "Main":
    - link "Home"
- main:
  - heading "Checkout" [level=1]
  - form "Payment":
    - textbox "Email address"
    - button "Pay now"
    - text: Submit
```

### Sizes on realistic markup

Measured by `packages/testing-library/test/unit/agent-debug-size.test.ts` (run it with
`PRINT_SIZES=1` to print the numbers), in characters, prettyDOM without ANSI colors (with them
it is about 40% bigger):

| Fixture | prettyDOM, full | `screen.debug()` (7000-char cut) | compact HTML, full | aria snapshot, full | aria snapshot, default budget | failing `getByRole` error, upstream | same, `CTRL_DOM_DEBUG=aria` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tailwind checkout form (12 fields, 3 cart items, SVG icons) | 34,782 | 7,003 | 13,392 | 1,763 | 1,763 | 20,693 | 2,156 |
| ~200 KB app page (`comparison/fixtures/page.ts`) | 552,377 | 7,003 | 369,839 | 148,426 | 7,275 | 437,325 | 3,897 |

The checkout form's whole accessibility tree is 5% of its HTML and fits where upstream's
debug output is cut off a fifth of the way in. On the big page the default 200-line budget keeps
the snapshot near upstream's 7000-character cut while covering the structure of the page
(repeated cards and rows collapse), and the failing query's error is about 1% of upstream's,
whose role listing alone prints every element on the page.

## The snapshot format

```yaml
- banner:
  - navigation "Main":
    - link "Home" [current=page]
- main:
  - heading "Checkout" [level=1]
  - form "Payment":
    - textbox "Email" [active]: ada@example.com
    - checkbox "Remember me" [checked]
    - combobox "Country":
      - option "Canada" [selected]
    - slider "Volume": "30"
    - button "Menu" [expanded=false]
    - button "Pay" [disabled]
    - paragraph: Total due today
    - list:
      - listitem: Item 0
      - listitem: Item 1
      - listitem … (+46 more)
# … 120 more lines (raise maxLines or CTRL_DOM_DEBUG_LINES)
```

- `- role "name"`: the role `*ByRole` matches (first `role` token, or the implicit role from
  [html-aam](https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings) as aria-query has
  it) and the [accessible name](https://w3c.github.io/accname/). Elements without a role
  (`generic` divs and spans, `role="none"`/`"presentation"`, SVG internals) are skipped and
  their children hoisted. `<input type="password">` has no role in aria-query, so it is not in
  the snapshot either (query it with `getByLabelText`).
- States: `[checked]`, `[checked=mixed]`, `[disabled]`, `[expanded]`, `[pressed]`,
  `[pressed=mixed]`, `[selected]`, `[level=N]`, `[current]` / `[current=page]`, `[busy]`, and
  `[active]` on `document.activeElement`. Beyond Playwright's output: `[expanded=false]` and
  `[pressed=false]` for explicit false values (only those match `expanded: false` /
  `pressed: false`), and `[hidden]`.
- After the colon: the value of textboxes, comboboxes, spinbuttons and sliders
  (`aria-valuetext`, `aria-valuenow` or the input value), or the text of a node whose only content
  is text. Text that repeats the name (a button's label, a `<label>` next to its control, a
  `<legend>`) is not printed twice. `- text:` lines are text runs next to other nodes.
- Hidden content: like `*ByRole`, elements excluded from the accessibility tree (`hidden`,
  `aria-hidden="true"`, `display: none`, `visibility: hidden`;
  [tree exclusion](https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion)) are left out.
  `{ hidden: true }` includes them marked `[hidden]`. A snapshot of an element that is itself
  hidden starts with `# hidden from the accessibility tree: aria-hidden="true" on <div>`.

Options (`ariaSnapshot`, and `prettyDOM` / `debug()` with `format: "aria"`):

| Option | Default | |
| --- | --- | --- |
| `hidden` | `false` | include excluded elements, marked `[hidden]` |
| `maxLines` | 200 (`CTRL_DOM_DEBUG_LINES`) | line budget, then `# … N more lines` |
| `maxTextLength` | 100 | truncate names, values and text with `…` |
| `collapseAfter` | 5 | runs of more same-role siblings print the first 5 and `- role … (+N more)`; `Infinity` disables |
| `urls` | `false` | print link targets as `- /url: …` children |

## Closest matches

Under `CTRL_DOM_DEBUG`, a failed query lists likely fixes, best guesses first, as snapshot lines
with a `# reason`:

| Query | Candidates |
| --- | --- |
| `*ByRole` | the element hidden from the accessibility tree, with the reason; the right role and name but a state filter that does not match (`role and name match, state is not { pressed: true }`); the same name with another role (`same name, role "link"`); the text on an element with no role (`<div onClick>`); same-role elements with similar (case, substring, shared word) or other names |
| `*ByText` | text split across child elements (`Total: <strong>$42</strong>`); similar text; text that matches but not the `selector` option |
| `*ByLabelText` | every form control with its accessible name; controls with only a placeholder or no label |

"Found multiple elements" errors print each match as its snapshot line(s) instead of its HTML.
`findBy*` and `waitFor` timeouts keep the candidates and print the snapshot once (upstream
prints the DOM a second time there).

## Diffing snapshots

```ts
const before = screen.ariaSnapshot();
await user.click(screen.getByRole("button", { name: "Menu" }));
console.log(diffAriaSnapshots(before, screen.ariaSnapshot()));
```

```
  - navigation "Main":
-   - button "Menu" [expanded=false]
+   - button "Menu" [expanded]
+   - menu:
+     - menuitem "Settings"
```

Changed lines come with their unchanged parent lines as context; `…` marks skipped lines.

## Guidance for agents

- Rerun the failing test with `CTRL_DOM_DEBUG=aria` before reading any HTML.
- Read "Closest matches" first. Most failures are a different name, a role-less `<div>`, an
  element hidden by `aria-hidden` / `display: none`, or a state filter.
- Write queries from the snapshot: `- button "Pay now" [disabled]` is
  `getByRole("button", { name: "Pay now" })`, and `toBeDisabled()` will pass.
- Need more lines? `CTRL_DOM_DEBUG_LINES=1000`, or `screen.ariaSnapshot(el, { maxLines: Infinity })`
  for one subtree. Need attributes (`data-*`, `href`)? `CTRL_DOM_DEBUG=compact` prints HTML without
  the noise, or pass `{ urls: true }` for link targets.
- After an interaction, `diffAriaSnapshots(before, after)` shows what the component changed.

## Compatibility

- With `CTRL_DOM_DEBUG` unset and no `format` option, `prettyDOM`, `debug()`, `logRoles` and
  every query error are byte-identical to `@testing-library/dom@10.4.2`;
  `test/unit/agent-debug.test.ts` checks this against the stock package on jsdom, next to the
  existing differential suites.
- A custom `configure({ getElementError })` still wins: agent mode only changes the default one.
- The additions are new exports (`ariaSnapshot`, `diffAriaSnapshots`), a new `screen` method and
  new optional option keys. Upstream signatures are unchanged.
