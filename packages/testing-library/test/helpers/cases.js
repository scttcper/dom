// Minimal stand-in for jest-in-case (MIT, https://github.com/thinkmill/jest-in-case):
// `cases(title, tester, testCases)` → one describe block with one test per case; object
// keys become `name` on each case.

export default function cases(title, tester, testCases) {
  const normalized = Array.isArray(testCases)
    ? testCases
    : Object.keys(testCases).map(name => ({name, ...testCases[name]}))
  describe(title, () => {
    normalized.forEach((testCase, index) => {
      const name = testCase.name || `case: ${index + 1}`
      const fn = testCase.only ? test.only : testCase.skip ? test.skip : test
      fn(name, () => tester(testCase))
    })
  })
}
