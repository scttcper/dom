// Port of @testing-library/jest-dom@7.0.1 src/jest-globals.js: extends `@jest/globals`' expect.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/jest-globals.js
// @ts-ignore -- @jest/globals is provided by the user's Jest installation.
import { expect } from "@jest/globals";
import * as extensions from "./matchers.ts";

expect.extend(extensions);
