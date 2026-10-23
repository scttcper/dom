// Copied from @testing-library/jest-dom@7.0.1 types/matchers-standalone.d.ts (MIT) — the public types of this drop-in.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/types/matchers-standalone.d.ts
import {type TestingLibraryMatchers as _TLM} from './matchers'

interface MatcherReturnType {
  pass: boolean
  message: () => string
}

interface OverloadedMatchers {
  toHaveClass(expected: any, ...rest: string[]) : MatcherReturnType
  toHaveClass(
    expected: any,
    className: string,
    options?: {exact: boolean},
  ) : MatcherReturnType
}

declare namespace matchersStandalone {
  type MatchersStandalone = {
    [T in keyof _TLM<any, void>]: (
      expected: any,
      ...rest: Parameters<_TLM<any, void>[T]>
    ) => MatcherReturnType
  } & OverloadedMatchers

  type TestingLibraryMatchers<E, R> = _TLM<E, R>
}

declare const matchersStandalone: matchersStandalone.MatchersStandalone &
  Record<string, any>
export = matchersStandalone
