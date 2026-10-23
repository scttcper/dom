# vitest-environment-rtd

Vitest environment that installs an `@rtd/dom` window as the test globals.

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    environment: "rtd",
    environmentOptions: { rtd: { url: "http://localhost:3000/" } },
  },
});
```

Or per file: `// @vitest-environment rtd`. Peer dependency: `vitest` >= 5.

## Idle time skipping

Timers run on a virtual clock. Whenever the test is only waiting for a timer (no pending
immediates, no I/O), the clock jumps to it and `Date`/`performance.now()` advance with it, so
`findBy*`/`waitFor`, debounces, user-event delays and timeouts finish without spending wall
time, in the same order and with the same app-visible elapsed time. A `findBy` that never
matches fails after 1 s of virtual time instead of 1 s of real time. Set `environmentOptions.rtd.timeSkip` to `false` (or
`RTD_TIME_SKIP=0`) for real-time timers.

Part of [react-testing-dom](../../README.md). Third-party notices: `dist/NOTICE`.
