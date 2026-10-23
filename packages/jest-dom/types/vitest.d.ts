// Copied from @testing-library/jest-dom@7.0.1 types/vitest.d.ts (MIT) — the public types of this drop-in.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/types/vitest.d.ts
import 'vitest'
import {type TestingLibraryMatchers} from './matchers'

declare module 'vitest' {
  interface Assertion<T = any>
    extends TestingLibraryMatchers<
      any,
      T
    > {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<
      any,
      any
    > {}
}
