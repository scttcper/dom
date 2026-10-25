// Differential subject: @ctrl/dom/react + @ctrl/dom/jest-dom on the project's DOM (@ctrl/dom when
// CTRL_DOM_STACK=ctrl-dom, jsdom otherwise). Must produce exactly the stock transcripts in __oracle__/.
// See scenarios.tsx.
import { describe, test, expect } from "vitest";
import * as rtl from "@ctrl/dom/react/pure";
import * as matchers from "@ctrl/dom/jest-dom/matchers";
import { scenarios, Transcript, captureMatcherContext, type Lib } from "./scenarios.tsx";

const lib: Lib = { ...(rtl as any), matchers: matchers as any };
const ctx = captureMatcherContext();

describe(`differential (@ctrl/dom/react + @ctrl/dom/jest-dom on ${process.env.CTRL_DOM_STACK})`, () => {
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
