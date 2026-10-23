# @rtd/dom

> Workspace package `@rtd/dom`, published as `@ctrl/dom` (see the root README and scripts/release.ts).

Fast DOM implementation for testing React components — replaces jsdom / happy-dom. Usually
installed through `vitest-environment-ctrl-dom` or `jest-environment-ctrl-dom` rather than used directly.

```ts
import { createWindow, installGlobals } from "@ctrl/dom";
const window = createWindow({ url: "http://localhost/" });
const uninstall = installGlobals(window, globalThis);
```

`@ctrl/dom/internal` is the internal API the other `@rtd/*` packages build on; it has no
stability guarantees. ESM only (`require()` works through Node's require(esm)).

Part of [ctrl-dom](../../README.md). Third-party notices: `dist/NOTICE`.
