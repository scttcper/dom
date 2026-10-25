// Minimal vitest implementation of `jest-in-case` (https://github.com/atlassian/jest-in-case, MIT),
// which the upstream user-event suite uses for table tests.

import {describe, test} from 'vitest'

type Case = Record<string, any> & {
  name?: string
  only?: boolean
  skip?: boolean
}

export default function cases<C extends Case>(
  title: string,
  tester: (opts: C) => unknown,
  testCases: C[] | Record<string, C>,
): void {
  const entries: Array<[string, C]> = Array.isArray(testCases)
    ? testCases.map((c, i) => [c.name ?? `case: ${i + 1}`, c])
    : Object.entries(testCases).map(([name, c]) => [c.name ?? name, c])
  describe(title, () => {
    for (const [name, opts] of entries) {
      const fn = opts.only ? test.only : opts.skip ? test.skip : test
      fn(name, () => tester(opts))
    }
  })
}
