/**
 * waitFor's failed checks defer the prettyDOM of their TestingLibraryElementError until the
 * message is read (packages/testing-library/src/config.ts `lazyElementErrors`), and the error a
 * findBy* or waitFor rejects with reads exactly as upstream's.
 *
 * Upstream: https://github.com/testing-library/dom-testing-library/blob/main/src/config.ts
 * (getElementError), https://github.com/testing-library/dom-testing-library/blob/main/src/wait-for.js
 * (checkCallback keeps the last error; onTimeout wraps its message with getElementError again).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { findByText, getByText, getConfig, waitFor } from "../../src/index.ts";

function form(): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = `<form><label for="a">Name</label><input id="a" value="x"><p>Saved</p></form>`;
  document.body.append(container);
  return container;
}

function missingMessage(container: HTMLElement, text: string): string {
  try {
    getByText(container, text);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected getByText to throw");
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("failed checks under real timers", () => {
  test("build no message until it is read, then read as the eager message and settle to a data property", async () => {
    const container = form();
    const failed: Error[] = [];
    let n = 0;
    await waitFor(() => {
      if (n++ === 3) return;
      try {
        getByText(container, "Nope");
      } catch (e) {
        failed.push(e as Error);
        throw e;
      }
    });
    expect(failed).toHaveLength(3);
    for (const e of failed) {
      expect(e.name).toBe("TestingLibraryElementError");
      expect(Object.getOwnPropertyDescriptor(e, "message")!.get).toBeTypeOf("function");
    }
    const expected = missingMessage(container, "Nope");
    expect(failed[0]!.message).toBe(expected);
    expect(Object.getOwnPropertyDescriptor(failed[0]!, "message")).toEqual({
      value: expected,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    expect(failed[1]!.stack!.split("\n")[0]).toBe(`TestingLibraryElementError: ${expected.split("\n")[0]}`);
  });

  test("a findBy* timeout rejects with upstream's message: the last error's, wrapped by onTimeout", async () => {
    const container = form();
    const expected = getConfig().getElementError(missingMessage(container, "Nope"), container).message;
    const error = await findByText(container, "Nope", undefined, { timeout: 30 }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(expected);
  });

  test("outside waitFor, getBy* errors are built eagerly", () => {
    const container = form();
    try {
      getByText(container, "Nope");
    } catch (e) {
      expect(Object.getOwnPropertyDescriptor(e as Error, "message")!.value).toContain("Unable to find an element");
    }
  });
});

describe("failed checks under fake timers", () => {
  test("keep eager messages: one advance can mutate the DOM and time out with no check in between", async () => {
    vi.useFakeTimers();
    const container = form();
    const failed: Error[] = [];
    let n = 0;
    await waitFor(() => {
      if (n++ === 2) return;
      try {
        getByText(container, "Nope");
      } catch (e) {
        failed.push(e as Error);
        throw e;
      }
    });
    expect(failed).toHaveLength(2);
    for (const e of failed) expect(Object.getOwnPropertyDescriptor(e, "message")!.value).toBeTypeOf("string");
  });
});
