// Jest fixture for window-raf-frame-task-lost-with-fake-timers.test.ts (run by that test with
// the upstream checkout's Jest, once per environment).
test("a frame requested under fake timers that are then uninstalled", () => {
  jest.useFakeTimers();
  requestAnimationFrame(() => {});
  jest.useRealTimers(); // the pending fake timer is dropped
});
test("later frames still run (real timers)", async () => {
  let ran = false;
  requestAnimationFrame(() => (ran = true));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(ran).toBe(true);
});
test("later frames still run (fake timers + runAllTimers, as React Aria tests flush FocusScope)", () => {
  jest.useFakeTimers();
  let ran = false;
  requestAnimationFrame(() => (ran = true));
  jest.runAllTimers();
  jest.useRealTimers();
  expect(ran).toBe(true);
});
