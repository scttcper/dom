# @ctrl/dom/jest-dom

Drop-in replacement for `@testing-library/jest-dom` 7.0: all matchers, same entry points and
types.

```ts
import "@ctrl/dom/jest-dom/vitest";        // Vitest setup file
import "@ctrl/dom/jest-dom";               // Jest setup file (extends the global expect)
import "@ctrl/dom/jest-dom/jest-globals";  // Jest with @jest/globals
import * as matchers from "@ctrl/dom/jest-dom/matchers";
```

Part of [ctrl-dom](../../README.md). Third-party notices: `dist/NOTICE`.
