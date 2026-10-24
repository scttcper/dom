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
  as `*ByRole` (`@rtd/aria`), so it shows what the queries match.
- **`prettyDOM(el, max, { format })`**: `"pretty"` (upstream), `"aria"` (the snapshot) or
  `"compact"` (HTML without `class`/`style` attributes and SVG internals, without ANSI colors).
  `screen.debug()` and `render().debug()` take the same option.
- **`CTRL_DOM_DEBUG=aria`** (or `compact`): switches `prettyDOM`, `screen.debug()`,
  `render().debug()` and the errors of failing queries to that format, with no code changes.
  Failed `*ByRole`, `*ByText` and `*ByLabelText` queries (including `findBy*` timeouts) also list
  the **closest matches**, which usually point at the fix.
- **`diffAriaSnapshots(before, after)`**: what changed between two snapshots, e.g. after a click.
- **Failure snapshots**: under `CTRL_DOM_DEBUG`, *any* failing test (a failed `expect(x).toBe(y)`,
  a thrown error, not only query errors) gets one snapshot of `document.body` appended to its
  error, taken before cleanup unmounts the tree, plus what changed since the last snapshot the
  test took. See [Failure snapshots](#failure-snapshots).
- **`expect(el).toMatchAriaSnapshot(template)`**: a jest-dom matcher with Playwright's aria
  snapshot semantics, for asserting structure the way the snapshot prints it. See
  [Asserting with toMatchAriaSnapshot](#asserting-with-tomatchariasnapshot).
- **`npx ctrl-dom debug <test file> [-t name]`**: runs one test file with Vitest or Jest in agent
  mode and prints a compact report. See [The ctrl-dom CLI](#the-ctrl-dom-cli).

## Turning it on

The shortest path for an agent is the CLI, which finds the project's runner and sets the mode:

```sh
npx ctrl-dom debug src/Checkout.test.tsx -t "submits the form"
```

Or set the variable in the test command:

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
A snippet for your `CLAUDE.md` / `AGENTS.md`:

```md
## Component tests

- When a component test fails, rerun just that file with `npx ctrl-dom debug <file> [-t <name>]`
  (or `CTRL_DOM_DEBUG=aria` in the usual test command). Failures then show the page as an
  accessibility snapshot (`- button "Save" [disabled]`) and the closest matches for failed
  queries, instead of HTML dumps. Read "Closest matches" first.
- Write queries and assertions from the snapshot: `- button "Pay now"` is
  `getByRole("button", { name: "Pay now" })`. To assert structure, paste the relevant lines into
  `expect(container).toMatchAriaSnapshot(\`…\`)`: it matches a subset of the tree, in order.
- Don't add `screen.debug()` calls to find out what rendered: the failure report already has it.
```

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

## Failure snapshots

A failed query explains itself, but most failing tests fail somewhere else: `expect(x).toBe(y)`,
a matcher, an exception in the component. An agent then adds `screen.debug()`, reruns, reads an
HTML dump and removes the call again. Under `CTRL_DOM_DEBUG`, every failing test's (first) error
already ends with the page as it was when the test failed:

```
AssertionError: expected 'Checkout' to be 'Cart' // Object.is equality

Accessibility snapshot of <body> when the test failed (CTRL_DOM_DEBUG=aria):
- main:
  - heading "Checkout" [level=1]
  - form "Payment":
    - textbox "Email"
    - button "Options" [expanded]
    - button "Gift wrap"

Changes since the previous snapshot in this test:
  - main:
  …
    - form "Payment":
  …
-     - button "Options" [expanded=false]
+     - button "Options" [expanded]
+     - button "Gift wrap"
```

- One snapshot per failing test, within `CTRL_DOM_DEBUG_LINES` (default 100 lines). Under
  `CTRL_DOM_DEBUG=compact` it is compact HTML instead.
- "Changes since the previous snapshot" appears when the test took a whole-page snapshot before
  failing (`screen.ariaSnapshot()`, `screen.debug()`, a query error or a `findBy*` retry under
  agent mode): what the component did since. "Unchanged since …" says it did nothing.
- When the error already printed the same snapshot (a failed query does), the report is one line:
  `Accessibility snapshot of <body> when the test failed: the same as above.`
- It is taken when the test function fails, before `afterEach` hooks such as Testing Library's
  cleanup empty the page.

How it is hooked:

- **Jest** (`testEnvironment: "ctrl-dom"` or `preset: "@ctrl/dom"`): the environment's
  `handleTestEvent` takes the snapshot on `test_fn_failure`, which jest-circus dispatches before
  `afterEach` hooks run, and appends it to the thrown error. Nothing to configure. Without
  `CTRL_DOM_DEBUG` the environment does not define `handleTestEvent` at all.
- **Vitest with `ctrlDom()`**: when `debug` (or `CTRL_DOM_DEBUG` in the shell) is set, the plugin
  adds the setup file `@ctrl/dom/vitest-environment/failure-snapshot`. Vitest runs
  `onTestFailed` callbacks after the `afterEach` hooks, so the setup file takes the snapshot in the
  first `afterEach` that runs after a failure (it wraps hooks registered through the global
  `afterEach`, which is how Testing Library registers its auto-cleanup) and appends it in
  `onTestFailed`.
- **Vitest with the bare environment**: add the setup file yourself (it does nothing unless
  `CTRL_DOM_DEBUG` is set):

  ```ts
  test: { environment: "ctrl-dom", setupFiles: ["@ctrl/dom/vitest-environment/failure-snapshot"] }
  ```

  With `globals: false` and a hand-written `afterEach(cleanup)` in an earlier setup file, the
  snapshot is still taken first (hooks run in reverse order of registration). A cleanup
  registered inside the test file with the imported `afterEach` runs first; the snapshot then
  shows the page after it.

## Asserting with toMatchAriaSnapshot

`expect(element).toMatchAriaSnapshot(template)`, from `@ctrl/dom/jest-dom` (and its `/vitest`,
`/jest-globals` and `/matchers` entries, typed for Vitest and Jest), asserts the accessibility tree
with [Playwright's aria snapshot](https://playwright.dev/docs/aria-snapshots) semantics. The
template is what `ariaSnapshot()` prints, cut down to what the test cares about:

```ts
expect(screen.getByRole("form", { name: "Payment" })).toMatchAriaSnapshot(`
  - form "Payment":
    - textbox "Email": ada@example.com
    - checkbox "Remember me" [checked]
    - button /Pay \\d+ €/ [disabled]
`);
```

- **Partial**: a node's listed children must appear in that order, others may sit between them.
  Attributes not listed are not checked; a node without a name matches any name. The template's
  first node may match anywhere in the tree; several top-level nodes must be children of one node.
- **Names and text**: `"exact"` (whitespace-normalized) or `/regex/`. `- role: text` matches a node
  whose content is that text (a textbox's value counts as its text); `- text: …` matches a text run.
- **States**: `[checked]`, `[checked=false]`, `[checked=mixed]`, `[disabled]`, `[expanded]`,
  `[expanded=false]`, `[pressed]`, `[selected]`, `[level=2]`, `[active]`, plus our `[current]` /
  `[current=page]`, `[busy]`, `[hidden]`. Unlike Playwright, `[active]` is checked.
- **Strict children**: `- /children: equal` (exact child list) or `deep-equal` (all levels below).
  `- /url: …` matches a link's `href`.
- The element passed in matches as itself; `document.body`, a document or a fragment by their
  children. Elements hidden from the accessibility tree are not part of it, as for `*ByRole`.
- An invalid template throws an `AriaTemplateError` naming the line, with a caret.

A failure compares the template with the closest part of the tree, projected onto the template's
shape, so the diff holds only what differs, then prints the tree (runs not collapsed, so it pastes
back as a template):

```
expect(element).toMatchAriaSnapshot(template)

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
- checkbox "Agree"
```

Upstream jest-dom has no such matcher, so this is purely additive: the other matchers and their
messages are unchanged (the differential suites in packages/jest-dom check them against the stock
package). The matching itself is `matchAriaSnapshot(container, template)` from
`@ctrl/dom/testing-library/agent`, for other test runners. Templates are not updated in place
(there is no inline-snapshot writer): paste the "Received accessibility tree" lines you want.

## The ctrl-dom CLI

```sh
npx ctrl-dom debug <test file>... [-t <name>] [--runner vitest|jest] [--config <file>]
                   [--format aria|compact] [--lines <n>] [--raw] [-- <runner args>]
```

Shipped as the `ctrl-dom` bin of `@ctrl/dom` (Node built-ins only). It picks Vitest or Jest from
`--config`'s name, the test file's imports, the project's config files and its dependencies, runs
the project's own runner on just those files (Jest with `--runTestsByPath --ci`) with
`CTRL_DOM_DEBUG=aria`, and prints a plain-text report through its own reporter: each failure with
its message (closest matches, failure snapshot, expected/received), the first stack frame in the
test file, the console output (150 lines; `CTRL_DOM_DEBUG_CONSOLE_LINES`), and a summary. It exits
with the run's status (2 for usage errors). `--raw` keeps the runner's own reporter.

```
ctrl-dom debug: vitest src/Signup.test.tsx (CTRL_DOM_DEBUG=aria)

FAIL  signs up
  Error: expect(element).toBeEnabled()

  Received element is not enabled:
    <button disabled="" type="submit" />

  Accessibility snapshot of <body> when the test failed (CTRL_DOM_DEBUG=aria):
  - textbox "Name"
  - checkbox "Subscribe"
  - button "Sign up" [disabled]

  at src/Signup.test.tsx:10:59

1 failed · vitest · src/Signup.test.tsx · 0.4 s
```

Failure snapshots need the ctrl-dom environment: Jest's (`testEnvironment: "ctrl-dom"` or the
preset), or under Vitest the `ctrlDom()` plugin or the setup file line above. The report ends with
a note when failures came without one.

Sizes for the 5-test fixtures in packages/vitest-environment/test/failure-snapshot and
packages/jest-environment/jest (4 and 2 failing tests), in characters, without colors:

| Run | Vitest | Jest |
| --- | --- | --- |
| runner's default output, `CTRL_DOM_DEBUG` unset (no page in the failures; the failed query prints its HTML) | 4,209 | 961 |
| runner's default output, `CTRL_DOM_DEBUG=aria` (a page snapshot in every failure) | 4,041 | 1,377 |
| `ctrl-dom debug` (the same, plus console output) | 2,237 | 799 |

## Guidance for agents

- Run the failing test with `npx ctrl-dom debug <file>` (or `CTRL_DOM_DEBUG=aria`) before reading
  any HTML; the failure already shows the page.
- Read "Closest matches" first. Most failures are a different name, a role-less `<div>`, an
  element hidden by `aria-hidden` / `display: none`, or a state filter.
- Write queries from the snapshot: `- button "Pay now" [disabled]` is
  `getByRole("button", { name: "Pay now" })`, and `toBeDisabled()` will pass.
- Need more lines? `CTRL_DOM_DEBUG_LINES=1000`, or `screen.ariaSnapshot(el, { maxLines: Infinity })`
  for one subtree. Need attributes (`data-*`, `href`)? `CTRL_DOM_DEBUG=compact` prints HTML without
  the noise, or pass `{ urls: true }` for link targets.
- After an interaction, `diffAriaSnapshots(before, after)` shows what the component changed.
- Assert structure with `toMatchAriaSnapshot`, pasting only the lines that matter.

## Compatibility

- With `CTRL_DOM_DEBUG` unset and no `format` option, `prettyDOM`, `debug()`, `logRoles` and
  every query error are byte-identical to `@testing-library/dom@10.4.2`;
  `test/unit/agent-debug.test.ts` checks this against the stock package on jsdom, next to the
  existing differential suites.
- A custom `configure({ getElementError })` still wins: agent mode only changes the default one.
- The additions are new exports (`ariaSnapshot`, `diffAriaSnapshots`), a new `screen` method and
  new optional option keys. Upstream signatures are unchanged.
- Failure snapshots change nothing without `CTRL_DOM_DEBUG`: the Jest environment defines no
  `handleTestEvent`, the plugin adds no setup file, and the setup file registers no hooks.
- `toMatchAriaSnapshot` is a new matcher; `@ctrl/dom/testing-library/agent` and
  `@ctrl/dom/vitest-environment/failure-snapshot` are new entry points.
