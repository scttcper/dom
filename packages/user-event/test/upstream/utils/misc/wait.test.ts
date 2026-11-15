// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/misc/wait.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {createConfig} from '#src/setup/setup.ts'
import {wait} from '#src/utils/misc/wait.ts'

test('advances timers when set', async () => {
  const beforeReal = performance.now()
  vi.useFakeTimers()
  const beforeFake = performance.now()

  const config = createConfig({
    delay: 1000,
    advanceTimers: t => vi.advanceTimersByTime(t),
  })
  await wait(config)

  expect(performance.now() - beforeFake).toBe(1000)
  vi.useRealTimers()
  expect(performance.now() - beforeReal).toBeLessThan(1000)
  // Upstream's test timeout is 10 ms. Everything here runs cold (installing fake timers, the
  // first wait()), and with this file alone on idle cores at their lowest frequency the test took
  // 25 ms. The assertion above already pins that the 1000 ms delay is not waited in real time.
}, 500)
