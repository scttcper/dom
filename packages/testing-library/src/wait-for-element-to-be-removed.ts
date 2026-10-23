// Port of @testing-library/dom src/wait-for-element-to-be-removed.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/wait-for-element-to-be-removed.js

import { waitFor, type WaitForOptions } from "./wait-for.ts";

const isRemoved = (result: any) => !result || (Array.isArray(result) && !result.length);

// Check if the element is not present.
// As the name implies, waitForElementToBeRemoved should check `present` --> `removed`
function initialCheck(elements: any) {
  if (isRemoved(elements)) {
    throw new Error(
      "The element(s) given to waitForElementToBeRemoved are already removed. waitForElementToBeRemoved requires that the element(s) exist(s) before waiting for removal.",
    );
  }
}

export async function waitForElementToBeRemoved<T>(callback: T | (() => T), options?: WaitForOptions): Promise<void> {
  // created here so we get a nice stacktrace
  const timeoutError = new Error("Timed out in waitForElementToBeRemoved.");
  if (typeof callback !== "function") {
    initialCheck(callback);
    const elements: any[] = Array.isArray(callback) ? callback : [callback];
    const getRemainingElements = elements.map((element) => {
      let parent = element.parentElement;
      if (parent === null) return () => null;
      while (parent.parentElement) parent = parent.parentElement;
      return () => (parent.contains(element) ? element : null);
    });
    callback = () => getRemainingElements.map((c) => c()).filter(Boolean) as T;
  }
  const cb = callback as () => T;

  initialCheck(cb());

  return waitFor(() => {
    let result;
    try {
      result = cb();
    } catch (error: any) {
      if (error.name === "TestingLibraryElementError") {
        return undefined;
      }
      throw error;
    }
    if (!isRemoved(result)) {
      throw timeoutError;
    }
    return undefined;
  }, options);
}
