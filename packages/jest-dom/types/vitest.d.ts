// Copied from @testing-library/jest-dom@7.0.1 types/vitest.d.ts (MIT) — the public types of this drop-in.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/types/vitest.d.ts
import 'vitest'
import {type TestingLibraryMatchers} from './matchers'

// Intentional difference: Vitest 5 declares `Assertion<R, T>` and routes custom matchers
// through `Matchers<R, T>`, which `Assertion` and `AsymmetricMatchersContaining` both extend.
// Upstream's `Assertion<T = any>` no longer merges with it ("All declarations of 'Assertion' must
// have identical type parameters" for projects without skipLibCheck), so the matchers go on
// `Matchers`, returning R (`void`, or `Promise<void>` after .resolves/.rejects).
declare module 'vitest' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<any, R> {}
}
