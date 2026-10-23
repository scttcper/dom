# @rtd/jest-dom

Drop-in replacement for `@testing-library/jest-dom` 7.0: all matchers, same entry points and
types.

```ts
import "@rtd/jest-dom/vitest";        // Vitest setup file
import "@rtd/jest-dom";               // Jest setup file (extends the global expect)
import "@rtd/jest-dom/jest-globals";  // Jest with @jest/globals
import * as matchers from "@rtd/jest-dom/matchers";
```

Part of [react-testing-dom](../../README.md). Third-party notices: `dist/NOTICE`.
