# jest-environment-ctrl-dom

Jest environment that installs an `@ctrl/dom` window as the test globals.

```js
// jest.config.js
module.exports = {
  // Environment only (stock @testing-library/* packages):
  testEnvironment: "ctrl-dom",
  // or the whole stack, stock @testing-library/* imports routed to @ctrl/dom:
  preset: "@ctrl/dom",
};
```

The environment publishes the DOM modules it loaded on the test global, and published
`@ctrl/dom` / `@ctrl/dom/internal` resolve to bridges that return them, so every module in a test
file shares one DOM (scripts/release.ts, writeBridges). Inside this repository, where the
packages run from source, the workspace preset maps the DOM's imports to the shims in src/shims/
for the same effect. Peer
dependencies: `jest` >= 30, `@ctrl/dom`.

Differences from jest-environment-jsdom you may notice (see `docs/deviations.md`):

- `testEnvironmentOptions` takes `createWindow` options (`url`, `width`, `platform`, ...) plus
  `nodeFetch: true` to keep Node's `fetch`/`Request`/`Response` (absent by default, as under
  jsdom). `compat` defaults to `"jsdom-26"`, the surface of jsdom 26 that jest-environment-jsdom
  30 ships (no `PointerEvent`); `"jsdom-30"` matches environments built on newer jsdom and
  `"modern"` adds what no jsdom has (`matchMedia`, `ResizeObserver`, `inert`). See
  `docs/deviations.md`.
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

Part of [ctrl-dom](../../README.md). Third-party notices: `dist/NOTICE`.
