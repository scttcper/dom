# Sentry

`@ctrl/dom/sentry` reports test runs to Sentry:

- **Each test file becomes a trace.** There's a span per test, and under each test a span per
  Testing Library query, `waitFor`, `fireEvent`, user-event action and React render, in the order
  they ran. A `findBy*` or `waitFor` span says how many times its callback ran and how much idle
  time the virtual clock skipped.
- **Each failing test becomes an issue**, grouped by file and test name, so the same test failing
  again lands in the same issue. The event links to the test's span in the trace, lists what the
  test did (and, under Vitest, what it printed) as breadcrumbs, points at the failing line with
  the source around it, and attaches the page as it was when the test failed (its accessibility
  snapshot and HTML), captured before Testing Library's cleanup emptied it. A file that fails to
  load is an issue too.
- **Each flaky test becomes an issue**: a test that failed and then passed on a retry, with the
  failed attempt's error.

It can send to a project (a DSN) or to [Spotlight](https://spotlightjs.com), Sentry's local
debugging UI, which needs no account.

## Setup

Vitest, with the `ctrlDom()` plugin:

```ts
// vitest.config.ts
export default defineConfig({
  plugins: [ctrlDom({ sentry: true })],
  test: { globals: true, retry: process.env.CI ? 1 : 0 },
});
```

Jest, with the preset (the reporter turns on collection in `@ctrl/dom-jest-environment`):

```js
// jest.config.js
module.exports = {
  preset: "@ctrl/dom",
  reporters: ["default", "@ctrl/dom/sentry/jest"],
};
```

Then set `SENTRY_DSN` (in CI, say) or `SENTRY_SPOTLIGHT=1` (locally, with Spotlight running:
`npx @spotlightjs/spotlight`). With neither, nothing is collected or sent. The run ends with
one line saying what was sent where:

```
@ctrl/dom/sentry: 12 traces, 1 failed test, 2 flaky tests → o123.ingest.sentry.io
```

Flaky-test issues need retries: Vitest's `retry`, or `jest.retryTimes()` in a test file.

## Options

Pass them as `ctrlDom({ sentry: { … } })` or `["@ctrl/dom/sentry/jest", { … }]`. Each has an
environment variable fallback.

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
| `snapshots` | `true` | attach the page's accessibility snapshot and HTML to failure events |
| `tags` | | extra tags on every event |

Events are tagged with `runner`, `test.file`, `test.name`, `retries` and `flaky` (and
`test.project` for named Vitest projects or Jest projects), so issues can be searched by file.

## Spans

| `op` | Description, as the test wrote it | `data` |
| --- | --- | --- |
| `test.file` (transaction) | the file, relative to the root | `environment_setup` measurement |
| `test.case` | the test's full name | `test.retries`, `test.flaky` |
| `react.render`, `react.rerender` | `render(<Signup />)` | |
| `testing-library.query` | `getByRole("button", { name: "Save" })`, `findByText("Saved")` | `matches`, and for `findBy*` `checks` |
| `testing-library.wait_for` | `waitFor(() => expect(screen.getByText("Saved")).toBeVisible())` | `checks` |
| `testing-library.fire_event` | `fireEvent.click(button "Save")` | |
| `user-event.<action>` | `user.type(textbox "Email", "ada@example.com")` | |

Elements are named the way queries find them, by role and accessible name (`button "Save"`,
`option "Apple"`), else by tag and text. `render` names the component under test through the
wrappers test helpers add (providers, `StrictMode`, a data router's route element), so a
Sentry-style `render(ui)` helper still shows `render(<SearchQueryBuilder />)`. Callback source
reads as written, with Vite's and Babel's import rewriting undone.

Any span during which the virtual clock skipped idle time has `clock.skipped_ms`. A query that
threw (a `getBy*` retried inside `waitFor`) is a span with status `internal_error`. A test keeps
at most 300 spans (the rest are counted in `spans.dropped`). A transaction holds at most 1000, so
a file with more is split by whole tests into further transactions in the same trace, each a
child of the file's (`<file> (part 2 of 4)`), and no test loses its spans.

Spans come from @ctrl/dom's own Testing Library, React Testing Library and user-event. With stock
Testing Library (`ctrlDom({ testingLibrary: false })`) a trace has the tests' spans only.

## Cost

Nothing is collected unless a DSN or Spotlight is set. With reporting on, Sentry's own component
tests (the 15-file smoke set, 589 tests, on @ctrl/dom's Jest environment) took the same wall and
CPU time as without it, within run-to-run noise; the reporter sends while the run continues. A
large suite sends one transaction per file, which counts against span quota: `tracesSampleRate`
keeps a fraction of them.

## How it works

The packages publish spans on a `node:diagnostics_channel` tracing channel (`ctrl-dom:span`,
packages/dom/src/trace.ts). Each call site checks whether anything subscribes before formatting
a description, and that check costs about a nanosecond, so a run without Sentry pays nothing
measurable. In the test worker a collector subscribes (packages/sentry/src/collector.ts). It
nests spans through `AsyncLocalStorage`, timestamps them with the real clock (the environment's
`Date` and `performance` are virtual), and keeps them per test. Vitest carries them to the main
process on the test's meta; the Jest environment writes them to a temporary directory the
reporter reads. The reporter builds Sentry envelopes itself (no Sentry SDK) and sends them while
the run continues, a few at a time.

Anything else can subscribe too:

```js
import { tracingChannel } from "node:diagnostics_channel";
tracingChannel("ctrl-dom:span").subscribe({
  start: (span) => console.log(span.op, span.description),
  end() {}, asyncStart() {}, asyncEnd() {}, error() {},
});
```

## Limits

- Tests running concurrently in one file (`test.concurrent`) share a span list: a span belongs to
  whichever test began last.
- The failure snapshot is taken before cleanup that Testing Library registers itself (with
  Vitest's `globals: true`, and always under Jest). A test file that calls `afterEach(cleanup)`
  itself, with Vitest's imported `afterEach`, cleans up first, and the snapshot shows the emptied
  page.
- The attached HTML is the page as rendered, so it holds whatever the test rendered. Set
  `snapshots: false` if that shouldn't leave CI.
- Jest reports console output per file, not per test, so Jest failures have no console
  breadcrumbs.

## Development

`node packages/sentry/scripts/relay-check.ts` runs what the reporter builds through Relay,
Sentry's ingestion service (Docker, `getsentry/relay`), and fails if Relay rejects an envelope or
had to drop or fix a field. With `--run "<command>"` it runs a real suite with `SENTRY_DSN`
pointing at Relay instead, for example the downstream suites, whose runners add the reporter
with `RTD_SENTRY_REPORTER=1`:

```sh
RTD_SENTRY_REPORTER=1 node packages/sentry/scripts/relay-check.ts --run "node downstream/sentry/run.ts --preset components --modes rtd-full"
```
