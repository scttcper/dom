// Copied from @testing-library/jest-dom@7.0.1 types/jest-globals.d.ts (MIT) — the public types of this drop-in.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/types/jest-globals.d.ts
import {type expect} from '@jest/globals'
import {type TestingLibraryMatchers} from './matchers'

export {}
declare module '@jest/expect' {
  export interface Matchers<R extends void | Promise<void>>
    extends TestingLibraryMatchers<
      ReturnType<typeof expect.stringContaining>,
      R
    > {}
}
