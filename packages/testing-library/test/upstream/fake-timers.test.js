// Ported from https://github.com/testing-library/dom-testing-library/blob/main/src/__tests__/fake-timers.js (MIT).
// Assertions are upstream's; intentional differences are marked `DIVERGENCE(ctrl-dom):`.

import {waitFor, waitForElementToBeRemoved} from '../../src/index.ts'
import {render} from '../helpers/test-utils.js'

async function runWaitFor({time = 300} = {}, options) {
  const response = 'data'
  const doAsyncThing = () =>
    new Promise(r => setTimeout(() => r(response), time))
  let result
  doAsyncThing().then(r => (result = r))

  await waitFor(() => expect(result).toBe(response), options)
}

afterEach(() => {
  vi.useRealTimers()
})

test('real timers', async () => {
  // the only difference when not using fake timers is this test will
  // have to wait the full length of the timeout
  await runWaitFor()
})

// DIVERGENCE(ctrl-dom): Jest's legacy fake timers do not exist in Vitest; the "legacy" cases run
// with Vitest's (@sinonjs/fake-timers) clock instead, exercising our Vitest detection.
test('legacy', async () => {
  vi.useFakeTimers()
  await runWaitFor()
})

test('modern', async () => {
  vi.useFakeTimers()
  await runWaitFor()
})

test('fake timer timeout', async () => {
  vi.useFakeTimers()
  await expect(
    waitFor(
      () => {
        throw new Error('always throws')
      },
      {timeout: 10, onTimeout: e => e},
    ),
  ).rejects.toMatchInlineSnapshot(`[Error: always throws]`)
})

test('times out after 1000ms by default', async () => {
  const startReal = performance.now()
  vi.useFakeTimers()
  const {container} = render(`<div></div>`)
  const startFake = performance.now()
  // there's a bug with this rule here...
  // eslint-disable-next-line jest/valid-expect
  await expect(
    waitForElementToBeRemoved(() => container, {onTimeout: e => e}),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `Timed out in waitForElementToBeRemoved.`,
  )
  // NOTE: this assertion ensures that the timeout runs in the declared (fake) clock.
  expect(performance.now() - startFake).toBeGreaterThanOrEqual(1000)
  vi.useRealTimers()
  // NOTE: this assertion ensures that the timeout runs in the declared (fake) clock
  // while in real time the time was only a fraction since the real clock is only bound by the CPU.
  // So 20ms is really just an approximation on how long the CPU needs to execute our code.
  // If people want to timeout in real time they should rely on their test runners.
  expect(performance.now() - startReal).toBeLessThanOrEqual(20)
})

test('recursive timers do not cause issues', async () => {
  vi.useFakeTimers()
  let recurse = true
  function startTimer() {
    setTimeout(() => {
      // eslint-disable-next-line jest/no-conditional-in-test -- false-positive
      if (recurse) startTimer()
    }, 1)
  }

  startTimer()
  await runWaitFor({time: 800}, {timeout: 900})

  recurse = false
})

test('legacy fake timers do waitFor requestAnimationFrame', async () => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'performance']})

  let exited = false
  requestAnimationFrame(() => {
    exited = true
  })

  await waitFor(() => {
    expect(exited).toBe(true)
  })
})

test('modern fake timers do waitFor requestAnimationFrame', async () => {
  // DIVERGENCE(ctrl-dom): Jest's modern timers fake requestAnimationFrame by default; Vitest's need it listed.
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'performance']})

  let exited = false
  requestAnimationFrame(() => {
    exited = true
  })

  await waitFor(() => {
    expect(exited).toBe(true)
  })
})
