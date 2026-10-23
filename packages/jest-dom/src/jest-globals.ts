// Port of @testing-library/jest-dom@7.0.1 src/jest-globals.js: extends `@jest/globals`' expect.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/jest-globals.js
// @ts-ignore -- @jest/globals is provided by the user's Jest installation.
import { expect } from "@jest/globals";
import * as extensions from "./matchers.ts";

// @jest/globals is an optional peer dependency (so pnpm resolves it from the published package),
// which makes its types visible here; our MatcherContext types `isNot` as required, Jest's as
// optional, so cast — upstream's JS has no types to disagree.
expect.extend(extensions as Parameters<typeof expect.extend>[0]);
