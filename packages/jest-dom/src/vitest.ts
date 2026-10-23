// Port of @testing-library/jest-dom@7.0.1 src/vitest.js: extends vitest's `expect`.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/vitest.js
// Types: types/vitest.d.ts (module augmentation of vitest's Assertion).
import { expect } from "vitest";
import * as extensions from "./matchers.ts";

expect.extend(extensions as any);
