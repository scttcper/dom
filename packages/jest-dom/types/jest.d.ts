// Copied from @testing-library/jest-dom@7.0.1 types/jest.d.ts (MIT) — the public types of this drop-in.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/types/jest.d.ts
/// <reference types="jest" />

import {type TestingLibraryMatchers} from './matchers'

declare global {
  namespace jest {
    interface Matchers<R = void, T = {}>
      extends TestingLibraryMatchers<
        ReturnType<typeof expect.stringContaining>,
        R
      > {}
  }
}
