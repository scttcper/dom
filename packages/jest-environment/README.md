# @ctrl/dom-jest-environment

Jest environment for [@ctrl/dom](https://www.npmjs.com/package/@ctrl/dom), the DOM for testing
React components: a faster, leaner drop-in for `jest-environment-jsdom`.

```sh
pnpm add -D @ctrl/dom @ctrl/dom-jest-environment
```

The whole stack, with your `@testing-library/*` imports routed to @ctrl/dom:

```js
// jest.config.js
module.exports = {
  preset: "@ctrl/dom",
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"], // instead of "@testing-library/jest-dom"
};
```

The DOM only, with stock Testing Library:

```js
module.exports = { testEnvironment: "@ctrl/dom-jest-environment" };
```

Per file: `/** @jest-environment @ctrl/dom-jest-environment */`. Options
(`testEnvironmentOptions`) and the differences from jsdom are documented in
[@ctrl/dom's README](https://www.npmjs.com/package/@ctrl/dom). Requires Jest 30+ and Node 26+.
Test code that imports `@ctrl/dom` (or its subpaths) gets the environment's own instance.

## Differences from jest-environment-jsdom

The full list is in [deviations.md](https://github.com/scttcper/dom/blob/main/docs/deviations.md).

- `testEnvironmentOptions` takes `createWindow` options (`url`, `width`, `platform`, ...) plus
  `nodeFetch: true` to keep Node's `fetch`/`Request`/`Response` (absent by default, as under
  jsdom). `compat` defaults to `"jsdom-26"`, the surface of jsdom 26 that jest-environment-jsdom
  30 ships (no `PointerEvent`); `"jsdom-30"` matches environments built on newer jsdom and
  `"modern"` adds what no jsdom has (`matchMedia`, `ResizeObserver`, `inert`).
- `environment.dom` is a minimal stand-in for jsdom's `JSDOM` object: `window` and
  `reconfigure({ url })`.
- Timers the test file leaves pending are cleared at teardown, as jsdom's `window.close()` does.
- The test global is a plain, non-contextified vm global (as jsdom 30 creates its window), so
  global lookups in test and app code are ordinary property loads. Node's globals
  (`TextEncoder`, `structuredClone`, `setImmediate`, streams, ...) are installed lazily, as
  jest-environment-node does. There is no `testEnvironmentOptions.globalsCleanup`: nothing
  scrubs objects a test file left on the global (jsdom's environment doesn't either).

## Idle time skipping

Timers run on a virtual clock. Whenever the test is only waiting for a timer (no pending
immediates, no I/O), the clock jumps to it and `Date`/`performance.now()` advance with it, so
`findBy*`/`waitFor`, debounces, user-event delays and timeouts finish without spending wall
time, in the same order and with the same app-visible elapsed time. A `findBy` that never
matches fails after 1 s of virtual time instead of 1 s of real time. Set `testEnvironmentOptions.timeSkip` to `false` (or
`CTRL_DOM_TIME_SKIP=0`) for real-time timers.

## License

MIT. Third-party notices are in the package's `NOTICE` file.
