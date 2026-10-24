# @ctrl/dom

A DOM for testing React components. It replaces jsdom or happy-dom, and ships its own Testing
Library, user-event and jest-dom built on it. A 100-file React suite runs in 3.6 s with the whole
stack against 14.4 s on jsdom and 9.3 s on happy-dom, in less memory than either.

- **Drop-in.** Same globals as jsdom, and Testing Library implementations with the same
  exports, behavior, error messages and `prettyDOM` output as `@testing-library/dom`, `/react`,
  `/user-event` and `/jest-dom`. Swap only the DOM, or the whole stack, without touching tests.
- **Fast.** Queries like `getByRole` take microseconds instead of milliseconds, user-event
  doesn't wait on timers between keystrokes, and idle time in `findBy*`, `waitFor` and app
  debounces is skipped on a virtual clock instead of waited out.
- **Built for component tests.** No layout, no script execution, no navigation, no network;
  everything else a React component touches behaves like a browser, or like jsdom where test
  suites depend on it.

Requires Node 26+, React 19 for `@ctrl/dom/react`, and Vitest 5+, Jest 30+, node:test or Bun
(see [Other test runners](#other-test-runners)).

## Vitest

Whole stack: the environment plus your existing `@testing-library/*` imports routed to
`@ctrl/dom`.

```sh
pnpm add -D @ctrl/dom
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";

export default defineConfig({
  plugins: [ctrlDom()],
  // Optional and faster: each test file gets a fresh context in a reused worker instead of a
  // new worker, so per-file setup drops from about 23 ms to about 2 ms.
  test: { pool: "vmThreads" },
});
```

DOM only (stock Testing Library packages keep working):

```ts
export default defineConfig({ plugins: [ctrlDom({ testingLibrary: false })] });
```

Options go to the plugin: `ctrlDom({ url: "http://localhost:3000/", width: 1280 })`. With the
plugin installed, a file can also pick the environment itself: `// @vitest-environment ctrl-dom`.

The plugin also adds a Node flag to Vitest's workers, since the default pool starts one per test
file: with its Testing Library it turns the compile cache on as each worker starts, so Vitest's
own worker modules load from it too, not only the DOM.

## Jest

```sh
pnpm add -D @ctrl/dom @ctrl/dom-jest-environment
```

```js
// jest.config.js
module.exports = {
  preset: "@ctrl/dom", // the environment + @testing-library/* routed to @ctrl/dom
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"], // instead of "@testing-library/jest-dom"
};
```

DOM only: `testEnvironment: "@ctrl/dom-jest-environment"` (stock Testing Library keeps working).
Options go in `testEnvironmentOptions`. Per file: `/** @jest-environment @ctrl/dom-jest-environment */`.

## Other test runners

`@ctrl/dom/register` installs a window as the global for runners without a DOM environment, like
happy-dom's `@happy-dom/global-registrator`, with the Vitest environment's defaults: the
`jsdom-30` profile, `http://localhost:3000/`, idle time skipped on a virtual clock, and exceptions
thrown by event listeners failing the running test. Testing Library's automatic `cleanup()` after
each test works under both runners below, stock `@testing-library/react` included.

### node:test

```sh
node --import @ctrl/dom/register --test
```

or `import "@ctrl/dom/register";` as the first import of a test file. node:test's hooks are not
globals, so it exposes them as `beforeAll`, `afterAll`, `beforeEach` and `afterEach` (only names
not already defined), the way Jest and Bun do: that is what Testing Library looks for. After the
last test it closes the window and drops its pending timers, so a forgotten `setInterval` does not
keep the file's process running. Files get a fresh window each since node:test runs every file in
its own process; with `--test-isolation=none` they share one.

The jest-dom matchers need an `expect`. Jest's standalone [`expect`](https://www.npmjs.com/package/expect)
takes them as is; with `node:assert`, assert on DOM properties:

```ts
// signup.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "expect";
import * as matchers from "@ctrl/dom/jest-dom/matchers";
import { createElement } from "react";
import { render, screen } from "@ctrl/dom/react";
import userEvent from "@ctrl/dom/user-event";
import { Signup } from "./signup.ts";

expect.extend(matchers);

test("signs up", async () => {
  const user = userEvent.setup();
  render(createElement(Signup));
  assert.equal((screen.getByRole("button", { name: "Sign up" }) as HTMLButtonElement).disabled, true);
  await user.type(screen.getByLabelText("Name"), "Ada");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
});
```

Node strips TypeScript types but does not compile JSX: write `.ts` files with `createElement`, or
add a loader such as [tsx](https://www.npmjs.com/package/tsx) for `.tsx` files
(`node --import tsx --import @ctrl/dom/register --test`, with `"jsx": "react-jsx"` in your
tsconfig.json).

### Bun

```toml
# bunfig.toml
[test]
preload = ["@ctrl/dom/register"]
```

```tsx
// signup.test.tsx
import { expect, test } from "bun:test";
import * as matchers from "@ctrl/dom/jest-dom/matchers";
import { render, screen } from "@ctrl/dom/react";
import userEvent from "@ctrl/dom/user-event";
import { Signup } from "./signup.tsx";

expect.extend(matchers);

test("signs up", async () => {
  const user = userEvent.setup();
  render(<Signup />);
  expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
  await user.type(screen.getByLabelText("Name"), "Ada");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
});
```

`bun test` runs every file in one global, so files share the window (like Vitest with
`isolate: false`); `bun test --isolate` (or `--parallel`) gives every file a fresh global and
window. Bun's own test hooks are already globals.

### Configuration

A preload takes no arguments, so it reads `CTRL_DOM_URL`, `CTRL_DOM_COMPAT` (`jsdom-26`, `jsdom-30`,
`modern`), `CTRL_DOM_TIME_SKIP` (`0`/`1`) and `CTRL_DOM_TEST_HOOKS=0` (leave the runner alone).
Anything else goes through the API, which `@ctrl/dom/register/pure` exports without registering
on import:

```ts
import { register, unregister } from "@ctrl/dom/register/pure";

const { window } = register({ url: "http://localhost:5173/", compat: "modern", width: 1280 });
// ...
unregister(); // closes the window and restores every global it replaced
```

`register(options)` takes the [environment options](#options) (except `compileCache` and
`nodeFetch`) plus `testHooks` (default `false` here, `true` for `@ctrl/dom/register`), and replaces
any previous registration.

### Storybook

[Portable stories](https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest) run
under the ctrl-dom Vitest environment, and under node:test or Bun with `@ctrl/dom/register`:
`composeStories` stories render with `@ctrl/dom/react`'s `render`, and `await Story.run()` mounts
the story and runs its `play` function (Storybook's `storybook/test` brings its own Testing Library
and user-event, which run on the same DOM).

```tsx
import { composeStories } from "@storybook/react";
import { render, screen } from "@ctrl/dom/react";
import * as stories from "./Signup.stories.tsx";

const { Empty, Filled } = composeStories(stories);

test("renders", () => {
  render(<Empty />);
  expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
});

test("plays", async () => {
  await Filled.run();
  expect(screen.getByRole("status")).toHaveTextContent("Hi, Ada!");
});
```

`run()` leaves its canvas in the document after the test, as on jsdom: Testing Library's `cleanup()`
does not remove it, so a later test in the same file sees both (duplicate `id`s break label
lookups). Where test hooks are global (Jest, Bun, node:test with the register), importing
Testing Library's React entry turns React's act environment on, and React then warns about `play`
functions' state updates outside `act(...)`; the tests still pass.

## Direct imports

| Instead of | Import |
| --- | --- |
| `@testing-library/react` | `@ctrl/dom/react` (also `/react/pure`, `/react/dont-cleanup-after-each`) |
| `@testing-library/dom` | `@ctrl/dom/testing-library` |
| `@testing-library/user-event` | `@ctrl/dom/user-event` |
| `@testing-library/jest-dom` | `@ctrl/dom/jest-dom` (also `/jest-dom/vitest`, `/jest-dom/matchers`, `/jest-dom/jest-globals`) |
| `aria-query` + `dom-accessibility-api` | `@ctrl/dom/aria` |
| `jsdom` / `happy-dom` | `@ctrl/dom` (`createWindow()`, `installGlobals(window)`) |
| `@happy-dom/global-registrator` | `@ctrl/dom/register` (`register()`, `unregister()` from `/register/pure`) |

Under either environment, `@ctrl/dom` and every subpath share the environment's DOM instance,
in Jest and in every Vitest pool (including `vmThreads`/`vmForks`), so `instanceof` checks against
`@ctrl/dom`'s classes hold. The same goes for the window `@ctrl/dom/register` installs.

## Options

Environment options (`environmentOptions["ctrl-dom"]` in Vitest, `testEnvironmentOptions` in
Jest):

| Option | Default | |
| --- | --- | --- |
| `url` | `http://localhost:3000/` (Vitest), `http://localhost/` (Jest) | document URL |
| `width`, `height` | 1024 × 768 | `innerWidth` / `innerHeight`, drives `matchMedia` |
| `userAgent`, `platform`, `languages`, `devicePixelRatio`, `referrer` | jsdom-like | navigator / window values |
| `timeSkip` | `true` | skip idle time on a virtual clock; `false` keeps real-time timers. `CTRL_DOM_TIME_SKIP=0/1` overrides |
| `compat` | `"jsdom-30"` (Vitest), `"jsdom-26"` (Jest) | which APIs beyond jsdom's are exposed: see below |
| `layout` | off | `"lite"`: an approximate box model for geometry (`getBoundingClientRect`, `offset*`, `client*`, `scroll*`, ResizeObserver), so virtualizers (TanStack Virtual, react-window) and positioning libraries work without hand-written mocks. Off, geometry is zeros as in jsdom. Details: [docs/layout.md](https://github.com/scttcper/dom/blob/main/docs/layout.md) |
| `compileCache` (Vitest) | `true` with the plugin's Testing Library, else `false` | enable Node's compile cache before importing the DOM (with the plugin: as each worker starts), for every worker after the first. It stays on for everything the worker loads, which only pays off for large files (stock Testing Library's many small ones load slower). `CTRL_DOM_COMPILE_CACHE=0/1` overrides |
| `nodeFetch` (Jest) | `false` | keep Node's `fetch`/`Request`/`Response` (absent under jest-environment-jsdom) |

## Compat profiles

Suites written for jsdom feature-detect: a library that finds `PointerEvent`, `matchMedia` or
`ResizeObserver` takes its browser path, and a polyfill that installs itself only when an API is
missing leaves ours in place instead of its mock. `compat` picks what the test global exposes:

| `compat` | Matches | Exposes beyond jsdom 30 |
| --- | --- | --- |
| `"jsdom-26"` | jest-environment-jsdom 30 (jsdom 26.1); the Jest default | no `PointerEvent` or `onpointer*` handlers |
| `"jsdom-30"` | Vitest's jsdom environment; the Vitest default | nothing libraries feature-detect |
| `"modern"` | everything @ctrl/dom implements | `matchMedia`, `ResizeObserver`, the `inert` IDL attribute, `visualViewport` |

[docs/deviations.md](https://github.com/scttcper/dom/blob/main/docs/deviations.md) lists every API in
each profile, with the reason.

## Debugging with coding agents

`screen.debug()` and failing queries print the whole DOM as HTML, which costs an agent thousands
of tokens of classes and SVG paths. Run tests with `CTRL_DOM_DEBUG=aria` (or
`ctrlDom({ debug: "aria" })`) to print the accessibility tree in Playwright's aria snapshot
format instead, plus the closest matches when a `*ByRole`, `*ByText` or `*ByLabelText` query
fails:

```
Unable to find an accessible element with the role "button" and name "Submit"

Closest matches:
- text: "Submit"  # in <div>, which has no role: give it role="button" or use getByText
- button "Pay now"  # same role, other name

Accessibility snapshot of <body> (CTRL_DOM_DEBUG=aria):
- main:
  - heading "Checkout" [level=1]
  - form "Payment":
    - textbox "Email address"
    - button "Pay now"
    - text: Submit
```

That error is 468 characters; upstream prints 2,476 for the same small form, and around 437,000
for a large page. `ariaSnapshot(el?)` / `screen.ariaSnapshot()`, `prettyDOM(el, max, { format: "aria" })`
and `diffAriaSnapshots(before, after)` are available directly. `CTRL_DOM_DEBUG=compact` prints
HTML without class/style attributes and SVG internals. Without the variable, output is identical
to Testing Library's.

In the same mode, **every failing test** (a failed `toBe`, a thrown error, not just queries) ends
with a snapshot of the page as it was when it failed, before cleanup, plus what changed since the
test's previous snapshot. Jest's environment does this on its own; with Vitest, `ctrlDom()` adds
the setup file, or add `"@ctrl/dom/vitest-environment/failure-snapshot"` to `setupFiles` with the
bare environment.

`npx ctrl-dom debug <test file> [-t name]` does all of it in one command: it finds Vitest or Jest,
runs just that file in agent mode and prints a compact report (failures with their snapshot and
closest matches, one stack frame, console output), exiting with the test's status.

To assert structure the way the snapshot prints it, jest-dom gets
`expect(el).toMatchAriaSnapshot(template)`, with
[Playwright's](https://playwright.dev/docs/aria-snapshots) partial matching:

```ts
expect(screen.getByRole("form")).toMatchAriaSnapshot(`
  - textbox "Email"
  - button /Pay \\d+ €/ [disabled]
`);
```

A line for your `CLAUDE.md` / `AGENTS.md`:

> When a component test fails, rerun it with `npx ctrl-dom debug <file> [-t <name>]` and read the
> accessibility snapshot and closest matches instead of adding `screen.debug()`.

Details: [docs/agent-debugging.md](https://github.com/scttcper/dom/blob/main/docs/agent-debugging.md).

## Differences from jsdom

There is no script execution, no navigation and no network, as in jsdom and happy-dom, and no
layout unless you turn on `layout: "lite"` (otherwise geometry is zeros, as in jsdom). Every
intentional difference is listed, with the reason, in [docs/deviations.md](https://github.com/scttcper/dom/blob/main/docs/deviations.md).

## License

MIT. Includes code ported from Testing Library, dom-accessibility-api, aria-query, Playwright,
jsdom and others; their copyright notices and licenses are in the package's `NOTICE` file.
