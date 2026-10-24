# @ctrl/dom

The DOM for testing React components. A drop-in replacement for jsdom and happy-dom that is
several times faster and uses a fraction of the memory, with Testing Library, user-event and
jest-dom built in.

- **Drop-in.** Same globals as jsdom, and Testing Library implementations with the same
  exports, behavior, error messages and `prettyDOM` output as `@testing-library/dom`, `/react`,
  `/user-event` and `/jest-dom`. Swap only the DOM, or the whole stack, without touching tests.
- **Fast.** Queries like `getByRole` take microseconds instead of milliseconds, user-event
  doesn't wait on timers between keystrokes, and idle time in `findBy*`, `waitFor` and app
  debounces is skipped on a virtual clock instead of waited out.
- **Built for component tests.** No layout, no script execution, no navigation, no network;
  everything else a React component touches behaves like a browser, or like jsdom where test
  suites depend on it.

Requires Node 26+, React 19 for `@ctrl/dom/react`, and Vitest 5+ or Jest 30+.

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
  test: { pool: "vmThreads" }, // optional, and where @ctrl/dom shines: ~1 ms per test file
});
```

DOM only (stock Testing Library packages keep working):

```sh
pnpm add -D @ctrl/dom vitest-environment-ctrl-dom
```

```ts
export default defineConfig({ test: { environment: "ctrl-dom" } });
```

Per file: `// @vitest-environment ctrl-dom`. Options go under the environment's name:
`environmentOptions: { "ctrl-dom": { url: "http://localhost:3000/", width: 1280 } }`, or
`ctrlDom({ url, width })` with the plugin.

## Jest

```sh
pnpm add -D @ctrl/dom jest-environment-ctrl-dom
```

```js
// jest.config.js
module.exports = {
  preset: "@ctrl/dom", // the environment + @testing-library/* routed to @ctrl/dom
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"], // instead of "@testing-library/jest-dom"
};
```

DOM only: `testEnvironment: "ctrl-dom"` (stock Testing Library keeps working). Options go in
`testEnvironmentOptions`. Per file: `/** @jest-environment ctrl-dom */`.

## Direct imports

| Instead of | Import |
| --- | --- |
| `@testing-library/react` | `@ctrl/dom/react` (also `/react/pure`, `/react/dont-cleanup-after-each`) |
| `@testing-library/dom` | `@ctrl/dom/testing-library` |
| `@testing-library/user-event` | `@ctrl/dom/user-event` |
| `@testing-library/jest-dom` | `@ctrl/dom/jest-dom` (also `/jest-dom/vitest`, `/jest-dom/matchers`, `/jest-dom/jest-globals`) |
| `aria-query` + `dom-accessibility-api` | `@ctrl/dom/aria` |
| `jsdom` / `happy-dom` | `@ctrl/dom` (`createWindow()`, `installGlobals(window)`) |

Under either environment, `@ctrl/dom` and every subpath share the environment's DOM instance,
in Jest and in every Vitest pool (including `vmThreads`/`vmForks`), so `instanceof` checks against
`@ctrl/dom`'s classes hold.

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
| `compileCache` (Vitest) | `true` with the plugin's Testing Library, else `false` | enable Node's compile cache before importing the DOM, for every worker after the first. It stays on for everything the worker loads, which only pays off for large files (stock Testing Library's many small ones load slower). `CTRL_DOM_COMPILE_CACHE=0/1` overrides |
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

The repository's `docs/deviations.md` lists every API in each profile, with the reason.

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
to Testing Library's. Details: the repository's `docs/agent-debugging.md`.

## Differences from jsdom

There is no layout (geometry is zero unless mocked), no script execution, no navigation and no
network, as in jsdom and happy-dom. Every intentional difference is listed, with the reason, in
the repository's `docs/deviations.md`.
