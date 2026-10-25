/**
 * Downstream repro (React Aria: RAC Sheet.test.js fails to load — 63 tests missing in both ctrl-dom
 * modes — with "TypeError: Cannot assign to read only property 'supports' of object
 * '[object CSS]'"; the file stubs `window.CSS.supports = () => true` at module scope).
 *
 * `CSS` is a WebIDL namespace: its operations are regular data properties, { writable: true,
 * enumerable: true, configurable: true } (https://webidl.spec.whatwg.org/#es-namespaces,
 * https://webidl.spec.whatwg.org/#es-operations), so tests can stub them. @ctrl/dom freezes the
 * namespace object. (jsdom 26, upstream's baseline, has no CSS at all; jsdom 30 matches WebIDL.)
 *
 * Owner: css (window installs the namespace).
 */
import { describe, expect, test } from "vitest";
import { windows } from "./engines.ts";

describe.each(["jsdom", "ctrl-dom"] as const)("%s", (engine) => {
  test("CSS.supports is writable and configurable, so tests can stub it", () => {
    const window = windows[engine]();
    expect(Object.getOwnPropertyDescriptor(window.CSS, "supports")).toMatchObject({
      writable: true,
      configurable: true,
    });
    expect(Object.isFrozen(window.CSS)).toBe(false);
    const stub = () => true;
    window.CSS.supports = stub;
    expect(window.CSS.supports).toBe(stub);
  });
});
