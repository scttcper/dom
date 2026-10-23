# jest-environment-rtd

Jest environment that installs an `@rtd/dom` window as the test globals.

```js
// jest.config.js
module.exports = {
  // Environment only (stock @testing-library/* packages):
  testEnvironment: "jest-environment-rtd",
  // or, to also use @rtd/react, @rtd/user-event, @rtd/jest-dom in test files:
  preset: "jest-environment-rtd",
};
```

The preset maps `@rtd/dom` and `@rtd/dom/internal` to shims that return the environment's own
instance, so every module in a test file shares one DOM. Use the preset whenever test code
imports any `@rtd/*` package. Peer dependency: `jest` >= 30.

Differences from jest-environment-jsdom you may notice (see `docs/deviations.md`):

- `testEnvironmentOptions` takes `createWindow` options (`url`, `width`, `platform`, ...) plus
  `nodeFetch: true` to keep Node's `fetch`/`Request`/`Response` (absent by default, as under
  jsdom).
- `environment.dom` is a minimal stand-in for jsdom's `JSDOM` object: `window` and
  `reconfigure({ url })`.
- Timers the test file leaves pending are cleared at teardown, as jsdom's `window.close()` does.

Part of [react-testing-dom](../../README.md). Third-party notices: `dist/NOTICE`.
