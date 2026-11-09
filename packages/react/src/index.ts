// Port of @testing-library/react@16.3.3 src/index.js
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/index.js

import { getIsReactActEnvironment, setReactActEnvironment } from "./act-compat.ts";
import { registerTestHooks } from "@ctrl/dom/internal";
import { cleanup } from "./pure.ts";

declare const afterEach: ((fn: () => void) => void) | undefined;
declare const teardown: ((fn: () => void) => void) | undefined;
declare const beforeAll: ((fn: () => void) => void) | undefined;
declare const afterAll: ((fn: () => void) => void) | undefined;

// if we're running in a test runner that supports afterEach or teardown then we'll
// automatically run cleanup afterEach test. This ensures that tests run in isolation from
// each other. If you don't like this then either import the `pure` module or set the
// RTL_SKIP_AUTO_CLEANUP env variable to 'true'.
if (typeof process === "undefined" || !process.env?.RTL_SKIP_AUTO_CLEANUP) {
  if (typeof afterEach === "function") {
    afterEach(() => {
      cleanup();
    });
    // Ours: a hook registered here belongs to the test file that loaded this module. Where later
    // files share it (the ctrlDom() plugin's `sharedWorkers`), the plugin's setup file registers
    // the same for each of them (@ctrl/dom window/file-reset.ts).
    registerTestHooks("react", { afterEach: cleanup });
  } else if (typeof teardown === "function") {
    teardown(() => {
      cleanup();
    });
  }

  // No test setup with other test runners available
  if (typeof beforeAll === "function" && typeof afterAll === "function") {
    // This matches the behavior of React < 18.
    let previousIsReactActEnvironment = getIsReactActEnvironment();
    const enterActEnvironment = () => {
      previousIsReactActEnvironment = getIsReactActEnvironment();
      setReactActEnvironment(true);
    };
    const leaveActEnvironment = () => {
      setReactActEnvironment(previousIsReactActEnvironment);
    };
    beforeAll(enterActEnvironment);
    afterAll(leaveActEnvironment);
    registerTestHooks("react", { beforeAll: enterActEnvironment, afterAll: leaveActEnvironment });
  }
}

export * from "./pure.ts";
