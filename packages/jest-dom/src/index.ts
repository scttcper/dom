// Port of @testing-library/jest-dom@7.0.1 src/index.js: extends the global `expect` (Jest).
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/index.js
import * as extensions from "./matchers.ts";

declare const expect: { extend(matchers: Record<string, unknown>): void };

expect.extend(extensions);
