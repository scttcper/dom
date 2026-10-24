// `preset: "@ctrl/dom"`: the ctrl-dom Jest environment (install @ctrl/dom-jest-environment next to
// @ctrl/dom) with every stock Testing Library import routed to @ctrl/dom's implementation, so
// existing tests run on the whole stack unchanged. `testEnvironment: "@ctrl/dom-jest-environment"`
// alone swaps only the DOM.
//
// The targets are @ctrl/dom's CommonJS builds: Jest can only `require()` ES modules under
// `--experimental-vm-modules`. `@ctrl/dom` itself needs no mapping: its CommonJS entry returns the
// instance the environment loaded, so the test file and the environment share one DOM.
//
// Setup files are resolved without moduleNameMapper: list "@ctrl/dom/jest-dom" in
// `setupFilesAfterEnv` instead of "@testing-library/jest-dom".
"use strict";
const path = require("node:path");

const dist = (file) => path.join(__dirname, "dist", file);

module.exports = {
  testEnvironment: "@ctrl/dom-jest-environment",
  moduleNameMapper: {
    "^@testing-library/dom$": dist("testing-library/index.cjs"),
    "^@testing-library/react$": dist("react/index.cjs"),
    "^@testing-library/react/pure$": dist("react/pure.cjs"),
    "^@testing-library/react/dont-cleanup-after-each$": dist("react/dont-cleanup-after-each.cjs"),
    "^@testing-library/user-event$": dist("user-event/index.cjs"),
    "^@testing-library/jest-dom$": dist("jest-dom/index.cjs"),
    "^@testing-library/jest-dom/matchers$": dist("jest-dom/matchers.cjs"),
    "^@testing-library/jest-dom/jest-globals$": dist("jest-dom/jest-globals.cjs"),
  },
};
