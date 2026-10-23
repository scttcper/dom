# @rtd/dom

Fast DOM implementation for testing React components — replaces jsdom / happy-dom. Usually
installed through `vitest-environment-rtd` or `jest-environment-rtd` rather than used directly.

```ts
import { createWindow, installGlobals } from "@rtd/dom";
const window = createWindow({ url: "http://localhost/" });
const uninstall = installGlobals(window, globalThis);
```

`@rtd/dom/internal` is the internal API the other `@rtd/*` packages build on; it has no
stability guarantees. ESM only (`require()` works through Node's require(esm)).

Part of [react-testing-dom](../../README.md). Third-party notices: `dist/NOTICE`.
