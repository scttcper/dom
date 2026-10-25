/**
 * The layout-lite opt-in reaches the window through each environment's options (docs/layout.md):
 * Jest's `testEnvironmentOptions.layout` (@ctrl/dom-jest-environment) — the Vitest form,
 * `environmentOptions["ctrl-dom"].layout`, is exercised by tests/compat/vitest.layout.config.ts.
 * Off by default in every compat profile.
 *
 * Spec: CSSOM View offsetHeight — https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsetheight
 */
import { describe, expect, test } from "vitest";
import CtrlDomEnvironment from "../../../packages/jest-environment/src/index.ts";

type AnyGlobal = Record<string, any>;

async function offsetHeightUnder(testEnvironmentOptions: Record<string, unknown>): Promise<number> {
  const env = new CtrlDomEnvironment(
    { globalConfig: {}, projectConfig: { testEnvironmentOptions, globals: {}, fakeTimers: {}, testPath: "x.test.js" } } as never,
    { console, docblockPragmas: {}, testPath: "x.test.js" } as never,
  );
  await env.setup();
  try {
    const global = env.global as unknown as AnyGlobal;
    const div = global.document.body.appendChild(global.document.createElement("div"));
    div.style.height = "42px";
    return div.offsetHeight;
  } finally {
    await env.teardown();
  }
}

describe("@ctrl/dom-jest-environment testEnvironmentOptions.layout", () => {
  test('"lite" turns layout-lite on', async () => {
    expect(await offsetHeightUnder({ layout: "lite" })).toBe(42);
  });

  for (const compat of ["jsdom-26", "jsdom-30", "modern"]) {
    test(`off by default under the ${compat} profile`, async () => {
      expect(await offsetHeightUnder({ compat })).toBe(0);
    });
  }
});
