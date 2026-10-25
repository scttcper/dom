/**
 * Downstream repro (Sentry: searchQueryBuilder keyboard shortcuts, DropdownMenu modifier
 * clicks, page filter shortcuts, Scraps hotkeys; see TRIAGE.md):
 *
 * @ctrl/dom derives `navigator.platform` (and the userAgent's OS token) from the host OS
 * (`process.platform`): "MacIntel" on macOS, "Linux x86_64" on Linux. jsdom always reports "".
 * React Aria's `isMac()` is `/^Mac/i.test(navigator.platform)`, so on a Mac every
 * "Ctrl+K" / "Ctrl+Backspace" / ctrl-click test written against jsdom turns into the Meta
 * variant and fails, while the same tests pass on a Linux CI runner: results depend on the
 * machine. jsdom parity (and host-independent results) needs a fixed default, e.g. "".
 *
 * Spec: https://html.spec.whatwg.org/#dom-navigator-platform (implementation-defined value).
 * Owner: window (Navigator / createWindow defaults).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("navigator.platform default", (make) => {
  test("is the same on every host (jsdom: empty string), so React Aria's isMac() is false", () => {
    const window = make();
    expect(window.navigator.platform).toBe("");
    // React Aria: testPlatform(/^Mac/i)
    expect(/^Mac/i.test(window.navigator.platform)).toBe(false);
  });
});
