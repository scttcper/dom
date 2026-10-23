/**
 * Downstream repro (Base UI useDismiss touch tests: 2 failures in both rtd modes;
 * `fireEvent.touchStart(el, { touches: [{ clientX, clientY }] })`).
 *
 * Testing Library users pass plain objects as touches. jsdom accepts them (it has no Touch
 * interface, so TouchEventInit members are not converted) and exposes them on the event;
 * @rtd/dom performs the WebIDL conversion and throws "Failed to convert value to 'Touch'",
 * so the test crashes before the component runs.
 *
 * Spec: https://w3c.github.io/touch-events/#touchevent-interface (sequence<Touch> touches)
 * Owner: events (decide: accept touch-like objects as a documented compat deviation).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("TouchEvent accepts touch-like init objects", (make) => {
  test("new TouchEvent('touchstart', { touches: [{ clientX, clientY }] })", () => {
    const window = make();
    const create = () => new window.TouchEvent("touchstart", { touches: [{ identifier: 0, clientX: 1, clientY: 2 }] });
    expect(create).not.toThrow();
    expect(create().touches[0].clientX).toBe(1);
  });
});
