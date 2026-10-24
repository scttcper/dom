# jest-environment-ctrl-dom

Jest environment for [@ctrl/dom](https://www.npmjs.com/package/@ctrl/dom), the DOM for testing
React components: a faster, leaner drop-in for `jest-environment-jsdom`.

```sh
pnpm add -D @ctrl/dom jest-environment-ctrl-dom
```

```js
// jest.config.js
module.exports = {
  testEnvironment: "ctrl-dom", // DOM only: stock @testing-library/* keep working
  // preset: "@ctrl/dom",       // whole stack: @testing-library/* routed to @ctrl/dom
};
```

Per file: `/** @jest-environment ctrl-dom */`. Options (`testEnvironmentOptions`) and the
differences from jsdom are documented in
[@ctrl/dom's README](https://www.npmjs.com/package/@ctrl/dom). Requires Jest 30+ and Node 26+.
Test code that imports `@ctrl/dom` (or its subpaths) gets the environment's own instance.
