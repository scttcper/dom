// What each fixture file records about the process it runs in (one JSON line, FIXTURE_OUT).
import { appendFileSync } from "node:fs";
import { expect, test } from "vitest";

declare global {
  // eslint-disable-next-line no-var
  var __fixtureFilesInThisProcess: number | undefined;
}

export function record(file: string): void {
  test(`${file}: a fresh process and window`, () => {
    // Nothing of another file: this global and this element are set below, once per process.
    expect(globalThis.__fixtureFilesInThisProcess).toBeUndefined();
    expect(document.getElementById("left-behind")).toBeNull();
    expect(document.body.childNodes.length).toBe(0);
    globalThis.__fixtureFilesInThisProcess = 1;
    document.body.innerHTML = `<p id="left-behind">${file}</p>`;
    appendFileSync(
      process.env.FIXTURE_OUT!,
      `${JSON.stringify({
        file,
        pid: process.pid,
        fromGlobalSetup: process.env.FIXTURE_FROM_GLOBAL_SETUP ?? null,
        formData: typeof FormData,
        ownEvent: new Event("x") instanceof window.Event,
      })}\n`,
    );
  });
}
