// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/new-act.js
// `jest.mock('react')` + `jest.resetModules()` + `require` -> `vi.doMock` + `vi.resetModules()`
// + dynamic import of act-compat.
import { afterEach, beforeEach, expect, test, vi } from "vitest";

let asyncAct: (cb: () => unknown) => any;

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react");
    return {
      ...actual,
      act: (cb: () => unknown) => {
        return cb();
      },
    };
  });
  asyncAct = (await import("../../src/act-compat.ts")).default as any;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.doUnmock("react");
  vi.restoreAllMocks();
});

test("async act works when it does not exist (older versions of react)", async () => {
  const callback = vi.fn();
  await asyncAct(async () => {
    await Promise.resolve();
    await callback();
  });
  expect(console.error).toHaveBeenCalledTimes(0);
  expect(callback).toHaveBeenCalledTimes(1);

  callback.mockClear();
  (console.error as any).mockClear();

  await asyncAct(async () => {
    await Promise.resolve();
    await callback();
  });
  expect(console.error).toHaveBeenCalledTimes(0);
  expect(callback).toHaveBeenCalledTimes(1);
});

test("async act recovers from errors", async () => {
  try {
    await asyncAct(async () => {
      await null;
      throw new Error("test error");
    });
  } catch (err) {
    console.error("call console.error");
  }
  expect(console.error).toHaveBeenCalledTimes(1);
  expect((console.error as any).mock.calls).toMatchInlineSnapshot(`
    [
      [
        "call console.error",
      ],
    ]
  `);
});

test("async act recovers from sync errors", async () => {
  try {
    await asyncAct(() => {
      throw new Error("test error");
    });
  } catch (err) {
    console.error("call console.error");
  }
  expect(console.error).toHaveBeenCalledTimes(1);
  expect((console.error as any).mock.calls).toMatchInlineSnapshot(`
    [
      [
        "call console.error",
      ],
    ]
  `);
});
