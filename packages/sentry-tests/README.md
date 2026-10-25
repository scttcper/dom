# @ctrl/sentry-tests

Your test runs in Sentry, for Vitest and Jest:

- **Each failing test becomes an issue**, grouped by file and test name, so the same test failing
  again lands in the same issue (and a fixed test that breaks again is a regression). It carries
  the failing line, what the test did as breadcrumbs, and the page as it was when the test failed.
- **Each flaky test becomes an issue**: a test that failed and then passed on a retry, titled
  `FlakyTest`, with the failed attempt's error.
- **Each test file becomes a trace**, with a span for every describe block, test, hook and test
  function, so slow setup, slow hooks and slow tests show up where they are.

It works with any test environment (jsdom, happy-dom, node). With
[@ctrl/dom](https://github.com/scttcper/dom), traces also hold every Testing Library query,
`waitFor`, user-event action and React render, and failures get an accessibility snapshot of the
page. It sends to a Sentry project or to [Spotlight](https://spotlightjs.com), Sentry's local UI.
No Sentry SDK and no dependencies: it writes Sentry's envelopes itself and sends them from the
test runner's main process while the run continues.

## What it sends

A test file's trace:

```
cart.test.tsx                                  test.file      412 ms
├─ collect cart.test.tsx                       test.collect   180 ms
└─ Cart                                        test.suite     230 ms
   ├─ Cart > adds an item                      test.case       31 ms
   │  ├─ beforeEach                            test.hook        2 ms
   │  ├─ adds an item                          test.fn         27 ms
   │  │  ├─ render(<Cart />)                   react.render     9 ms  ┐
   │  │  ├─ user.click(button "Add")           user-event.click 6 ms  │ with @ctrl/dom
   │  │  └─ findByText("1 item")               testing-library.query 8 ms ┘
   │  └─ afterEach                             test.hook        1 ms
   └─ Cart > checks out                        test.case       ✗
```

A failing test's issue is titled by its error, for example
`TestingLibraryElementError: Unable to find role="option" and name "Option Three"`, with:

- **the failing line**: the test's own frame, with its source;
- **breadcrumbs**, what the test did, in order:
  ```
  beforeEach (2.1 ms)
  render(<CompactSelect />) (20 ms)
  getByRole("button", { name: "Option One" }) (0.8 ms, 1 match)
  user.click(button "Option One") (24 ms)
  findByRole("option", { name: "Option Three" }) (11 ms, 40 checks, 1994 ms skipped)
  ```
  plus, under Vitest, the test's console output;
- **the page when it failed**, captured before the afterEach hooks (and Testing Library's cleanup)
  emptied it: `page.html` from any DOM, and with @ctrl/dom `accessibility-snapshot.txt`:
  ```
  - button "Option One" [expanded]:
  - listbox "Option One":
    - option "Option One" [active] [selected]
    - option "Option Two"
  ```
- **tags** to search and alert on: `test.file`, `test.name`, `runner`, `flaky`, `retries` (and
  `test.project` in a multi-project setup);
- **a link to the test's span** in the file's trace.

A file that fails to load (an import or syntax error) is an issue too.

## Setup

### 1. A project for your tests

Create a Sentry project for test runs, separate from your app's, so test failures don't mix with
production issues (the platform doesn't matter; Node.js is closest). Its DSN is under
Settings → Projects → (the project) → Client Keys (DSN).

### 2. Vitest

```sh
npm install --save-dev @ctrl/sentry-tests
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { sentryTests } from "@ctrl/sentry-tests/vitest";

export default defineConfig({
  plugins: [sentryTests()],
  // Flaky-test issues come from retries.
  test: { retry: process.env.CI ? 1 : 0 },
});
```

The plugin adds a reporter, and makes the project's test runner one that records each file's spans
(Vitest's own runner, extended). Without a DSN or Spotlight it adds nothing, so local runs and
forks are unaffected.

- **With @ctrl/dom**: `plugins: [ctrlDom(), sentryTests()]`.
- **Projects** (`test.projects`): a project only gets the runner from plugins it has, so give each
  project the plugin, or use `extends: true`.
- **Your own runner** (`test.runner`): build it on ours, and the plugin leaves it in place.
  ```ts
  // my-runner.ts
  import { withSentry } from "@ctrl/sentry-tests/vitest-runner";
  export default withSentry(MyRunner); // MyRunner extends Vitest's TestRunner
  ```
- **Reporter only**: `reporters: ["default", "@ctrl/sentry-tests/vitest"]` sends the same issues,
  with one span per test and no page capture (there is no runner in the worker).

### 2. Jest

```js
// jest.config.js
module.exports = {
  reporters: ["default", "@ctrl/sentry-tests/jest"],
  // Records describe blocks, tests, hooks and test functions as spans, with any environment.
  testRunner: "@ctrl/sentry-tests/jest-runner",
};
```

The test runner is Jest's own (jest-circus), listening to its events; without the reporter it
does nothing. For flaky-test issues, retry with `jest.retryTimes(1)` in a setup file. Options go
in the reporter's entry: `["@ctrl/sentry-tests/jest", { tracesSampleRate: 0.1 }]`.

### 3. The DSN

In CI:

```yaml
# .github/workflows/test.yml
- run: npm test
  env:
    SENTRY_DSN: ${{ secrets.SENTRY_TESTS_DSN }}
```

The release defaults to `GITHUB_SHA`, so issues say which commit broke a test. The run ends with
one line saying what was sent where:

```
@ctrl/sentry-tests: 12 traces, 1 failed test, 2 flaky tests → o123.ingest.sentry.io
```

**Locally**, start Spotlight (`npx @spotlightjs/spotlight`, then open http://localhost:8969) and run
your tests with `SENTRY_SPOTLIGHT=1`.

## Options

`sentryTests({ … })`, or the Jest reporter's options. Each falls back to an environment variable.

| Option | Default | |
| --- | --- | --- |
| `dsn` | `SENTRY_DSN` | project to send to |
| `spotlight` | `SENTRY_SPOTLIGHT` | `true` for Spotlight's default sidecar (`http://localhost:8969/stream`), or its URL |
| `environment` | `SENTRY_ENVIRONMENT`, else `ci` under CI, else `local` | |
| `release` | `SENTRY_RELEASE`, else `GITHUB_SHA`, else the checkout's commit | regressions are tracked per release |
| `traces` | `true` | one trace per test file |
| `tracesSampleRate` | `SENTRY_TRACES_SAMPLE_RATE`, else `1` | fraction of files sent as traces; failures and flaky tests are always sent |
| `failures` | `true` | an issue per failing test |
| `flaky` | `true` | an issue per flaky test |
| `attachments` | `true` | attach the page (and whatever subscribers add) to failure events |
| `tags` | | extra tags on every event |

## Spans

| `op` | Description | `data` |
| --- | --- | --- |
| `test.file` (transaction) | the file, relative to the root | `environment_setup` measurement (Vitest) |
| `test.collect` | importing the file, with its setup files | |
| `test.suite` | a describe block's full name | `code.lineno` (Vitest) |
| `test.case` | the test's full name (Jest: one per attempt) | `test.retries`, `test.flaky`, `code.lineno` (Vitest) |
| `test.hook` | `beforeEach`, `afterEach`, `beforeAll`, `afterAll`; Vitest also `beforeEach cleanup` (functions a hook returned) | `hooks` (how many ran), `test.retry` |
| `test.fn` | the test function | `test.retry` |

A run of hooks of one kind is one span: a test's `beforeEach` hooks, its describe blocks' and its
setup files' together, and likewise for `afterEach`. With @ctrl/dom, under them:

| `op` | Description, as the test wrote it | `data` |
| --- | --- | --- |
| `react.render`, `react.rerender` | `render(<Signup />)` | |
| `testing-library.query` | `getByRole("button", { name: "Save" })`, `findByText("Saved")` | `matches`, and for `findBy*` `checks` |
| `testing-library.wait_for` | `waitFor(() => expect(screen.getByText("Saved")).toBeVisible())` | `checks` |
| `testing-library.fire_event` | `fireEvent.click(button "Save")` | |
| `user-event.<action>` | `user.type(textbox "Email", "ada@example.com")` | |

Any of those during which @ctrl/dom's virtual clock skipped idle time has `clock.skipped_ms`. A
test keeps at most 300 spans of its own (the rest are counted in `spans.dropped`). A transaction
holds at most 1000, so a file with more is split by whole tests into further transactions in the
same trace (`<file> (part 2 of 4)`), and no test loses its spans.

## Your own spans and attachments

Both go through `node:diagnostics_channel`, so nothing needs to import this package.

A span under whatever the test is running, on the `sentry-tests:span` tracing channel:

```ts
import { tracingChannel } from "node:diagnostics_channel";

const spans = tracingChannel("sentry-tests:span");
export const seed = (rows: Row[]) =>
  spans.tracePromise(() => db.insert(rows), { op: "db.seed", description: `seed ${rows.length} rows`, data: { rows: rows.length }, async: true });
```

Attachments and contexts for a failed test, on the `sentry-tests:failure` channel, published before
the test's afterEach hooks run:

```ts
// a setup file
import { channel } from "node:diagnostics_channel";
import { store } from "../src/store";

channel("sentry-tests:failure").subscribe((failure) => {
  failure.attachments.push({ filename: "store.json", contentType: "application/json", data: JSON.stringify(store.getState()) });
  failure.contexts.feature_flags = { ...flags };
  // failure.waitUntil(promise) holds the test (up to 5 s) for async work, a screenshot say.
});
```

The message's fields are typed as `FailureMessage`, exported from `@ctrl/sentry-tests`. A
subscriber must not throw.

## Cost

Nothing is collected unless a DSN or Spotlight is set. With reporting on, Sentry's own component
tests (15 files, 589 tests, Jest) ran in the same wall time as without it, within run-to-run
noise: the worker records spans into arrays, and the reporter sends while the run continues. Each
test file is a transaction, which counts against span quota: `tracesSampleRate` keeps a fraction
of them.

## Compared with @sentry/jest-environment

[@sentry/jest-environment](https://github.com/getsentry/jest-sentry-environment) records Jest
test files as transactions through the Sentry SDK, as a test environment wrapping jsdom or node.
This package:

- works with Vitest and Jest, with any environment, because it hooks the test runner rather than
  replacing the environment;
- reports failing and flaky tests as issues, with the page attached, not only performance data;
- sends from the main process (workers only collect), without the Sentry SDK or any dependency;
- takes spans and attachments from anything in the test process over diagnostics channels.

## Limits

- Tests running concurrently in one file (`test.concurrent`) under Jest share the span stack:
  their spans can land under each other. Vitest nests them correctly.
- The page capture reads `globalThis.document` in the worker; in Vitest's browser mode there is no
  page capture or runner spans (each test is one span).
- `page.html` is the page as rendered, so it holds whatever the test rendered. Set
  `attachments: false` if that shouldn't leave CI.
- Jest reports console output per file, not per test, so Jest failures have no console
  breadcrumbs.

## How it works

In the test worker, the runner (Vitest's `TestRunner` with its `trace` hook wrapped; for Jest,
jest-circus's events) opens a span for each describe block, test, hook and test function. The
current span lives in `AsyncLocalStorage`, so spans published on the tracing channels while a test
function awaits land under it. Times come from `perf_hooks`, which fake timers leave alone. When a
test fails, the runner captures the page and publishes `sentry-tests:failure` before the afterEach
hooks run. Vitest hands each file's spans to the main process on the file task's meta; Jest's
runner writes them to a temporary directory the reporter set up. The reporter builds the envelopes
and sends them, a few at a time, as each file finishes.

## Development

`node packages/sentry-tests/scripts/relay-check.ts` runs what the reporter builds through Relay,
Sentry's ingestion service (Docker, `getsentry/relay`), and fails if Relay rejects an envelope or
had to drop or fix a field. With `--run "<command>"` it runs a real suite with `SENTRY_DSN`
pointing at Relay instead.

MIT licensed. Part of [@ctrl/dom](https://github.com/scttcper/dom)'s repository.
