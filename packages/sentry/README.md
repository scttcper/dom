# @ctrl/dom/sentry

Test runs in Sentry: each test file as a trace, with spans for tests, Testing Library queries and
`waitFor`, user-event actions and renders; each failing test as an issue with the page's
accessibility snapshot attached; each test that passed only on a retry as a flaky-test issue.
Sends to a project DSN or to Spotlight.

```ts
// vitest.config.ts
export default defineConfig({ plugins: [ctrlDom({ sentry: true })], test: { globals: true } });
```

```js
// jest.config.js
module.exports = { preset: "@ctrl/dom", reporters: ["default", "@ctrl/dom/sentry/jest"] };
```

Then set `SENTRY_DSN` or `SENTRY_SPOTLIGHT=1`. Options and details: [docs/sentry.md](../../docs/sentry.md).

Part of [ctrl-dom](../../README.md). MIT licensed; third-party notices in [NOTICE](../../NOTICE).
