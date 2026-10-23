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

Part of [react-testing-dom](../../README.md). Third-party notices: `dist/NOTICE`.
