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
| `matchMedia` | `false` | expose `window.matchMedia` (no jsdom has it, so suites mock it) |
| `pointerEvent` (Jest) | `false` | expose `PointerEvent` (jest-environment-jsdom's jsdom has none) |
| `nodeFetch` (Jest) | `false` | keep Node's `fetch`/`Request`/`Response` (absent under jest-environment-jsdom) |

## Differences from jsdom

There is no layout (geometry is zero unless mocked), no script execution, no navigation and no
network, as in jsdom and happy-dom. APIs that jsdom lacks and libraries feature-detect
(`PointerEvent` under Jest, `matchMedia`, `ResizeObserver`, `inert`, `screen.orientation`) are
absent by default so suites written for jsdom take the code paths they were written for. Every
intentional difference is listed, with the reason, in the repository's `docs/deviations.md`.
