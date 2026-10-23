// Copied from @testing-library/jest-dom@7.0.1 types/bun.d.ts (MIT) — the public types of this drop-in.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/types/bun.d.ts
import {type expect} from 'bun:test'
import {type TestingLibraryMatchers} from './matchers'

export {}
declare module 'bun:test' {
  interface Matchers<T = any>
    extends TestingLibraryMatchers<
      ReturnType<typeof expect.stringContaining>,
      T
    > {}
}
