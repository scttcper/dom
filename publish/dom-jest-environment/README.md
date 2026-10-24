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

## License

MIT. Third-party notices are in the package's `NOTICE` file.
