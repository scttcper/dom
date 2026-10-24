# @ctrl/dom

A DOM for testing React components, replacing jsdom or happy-dom. Usually
installed through `vitest-environment-ctrl-dom` or `jest-environment-ctrl-dom` rather than used directly.

```ts
import { createWindow, installGlobals } from "@ctrl/dom";
const window = createWindow({ url: "http://localhost/" });
const uninstall = installGlobals(window, globalThis);
```

`@ctrl/dom/internal` is the internal API the other `@ctrl/dom` subpaths build on; it has no
stability guarantees. ESM only (`require()` works through Node's require(esm)).

Part of [ctrl-dom](../../README.md). Third-party notices: `dist/NOTICE`.
