/**
 * Downstream repro — FIXTURE ASSUMPTION, not a bug (Sentry: dropdownMenu.spec.tsx "navigates
 * to link on meta key", commandPalette featureFlagCommandPaletteActions.spec.tsx).
 *
 *   // JSDOM throws an error on navigation to random urls. [...]
 *   expect(errorSpy).toHaveBeenCalled();
 *
 * Activating an `<a href>` that leaves the document makes jsdom report
 * "Error: Not implemented: navigation (except hash changes)" through its virtual console, which
 * Jest's jsdom environment forwards to `console.error`. The Sentry tests assert that this
 * console.error happened. @ctrl/dom deliberately never navigates and logs nothing
 * (docs/deviations.md "Links never navigate"), so the assertion fails.
 *
 * Options for the owner: keep the deviation (recommended; the upstream assertion pins a jsdom
 * limitation) or emit the same diagnostic for jsdom parity.
 * Owner: html-elements (HTMLAnchorElement activation behaviour).
 */
import { expect, test, vi } from "vitest";
import { differential, requireFromReact } from "./engines.ts";

const { JSDOM, VirtualConsole } = requireFromReact("jsdom");

differential("clicking a cross-document link", (make, engine) => {
  test("reports jsdom's 'Not implemented: navigation' diagnostic", async () => {
    const errors: string[] = [];
    let window;
    if (engine === "jsdom") {
      // jsdom's virtual console: Jest's environment forwards "jsdomError" to console.error.
      const virtualConsole = new VirtualConsole();
      virtualConsole.on("jsdomError", (e: Error) => errors.push(e.message));
      window = new JSDOM("", { url: "http://localhost/", virtualConsole }).window;
    } else {
      window = make();
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void errors.push(String(args[0])));
    }
    window.document.body.innerHTML = '<a href="/test2">Item</a>';
    window.document.querySelector("a").click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    vi.restoreAllMocks();
    expect(errors.join("\n")).toMatch(/Not implemented: navigation/);
  });
});
