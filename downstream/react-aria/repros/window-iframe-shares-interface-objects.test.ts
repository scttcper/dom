/**
 * Downstream repro (React Aria: useFocusVisible "Setups global event listeners in a different
 * window" — 4 tests, "Expected: 'example', Received: 'example-focusVisible'").
 *
 * React Aria's addWindowFocusTracking(iframeRoot) patches `iframeWindow.HTMLElement.prototype
 * .focus` to tell programmatic focus from keyboard focus in that window, and restores it on the
 * iframe window's `beforeunload`. Each browsing context has its own interface objects
 * (https://html.spec.whatwg.org/#realms-settings-objects-global-objects), so this must not touch
 * the parent window. @ctrl/dom's iframe child window shares the parent's interface objects, so the
 * patch leaks into the parent document's focus tracking.
 *
 * Owner: window (+ html-elements: iframe child browsing context).
 */
import { describe, expect, test } from "vitest";
import { windows } from "./engines.ts";

describe.each(["jsdom", "ctrl-dom"] as const)("%s", (engine) => {
  test("an iframe's contentWindow has its own HTMLElement interface object and prototype", () => {
    const window = windows[engine]();
    const iframe = window.document.createElement("iframe");
    window.document.body.append(iframe);
    const child = iframe.contentWindow;
    expect(child).toBeTruthy();
    // Booleans: printing cross-realm interface objects trips Vitest's formatter on jsdom.
    expect(child.HTMLElement === window.HTMLElement).toBe(false);
    expect(child.HTMLElement.prototype === window.HTMLElement.prototype).toBe(false);
  });
});
