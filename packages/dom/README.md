# @ctrl/dom

A DOM for testing React components, replacing jsdom or happy-dom. Usually
used through the `ctrlDom()` Vitest plugin or `@ctrl/dom-jest-environment` rather than directly.

```ts
import { createWindow, installGlobals } from "@ctrl/dom";
const window = createWindow({ url: "http://localhost/" });
const uninstall = installGlobals(window, globalThis);
```

`@ctrl/dom/internal` is the internal API the other `@ctrl/dom` subpaths build on; it has no
stability guarantees. ESM only (`require()` works through Node's require(esm)).

Part of [ctrl-dom](../../README.md). MIT licensed; third-party notices in [NOTICE](../../NOTICE).
