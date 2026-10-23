// @vitest-environment jsdom
// Differential oracle: stock @testing-library/react + @testing-library/jest-dom on jsdom.
// See scenarios.tsx.
import { describe, test, expect } from "vitest";
import * as rtl from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { scenarios, Transcript, captureMatcherContext, type Lib } from "./scenarios.tsx";

const lib: Lib = { ...(rtl as any), matchers: matchers as any };
const ctx = captureMatcherContext();

describe("differential (stock @testing-library/* on jsdom)", () => {
  for (const [name, scenario] of Object.entries(scenarios)) {
    test(name, async () => {
      const t = new Transcript(lib, ctx);
      try {
        await scenario(t, lib);
      } finally {
        rtl.cleanup();
      }
      await expect(t.toString()).toMatchFileSnapshot(`./__oracle__/${name}.txt`);
    });
  }
});
