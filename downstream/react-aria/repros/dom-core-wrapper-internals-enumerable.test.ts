/**
 * Downstream repro (React Aria `all`: Jest crashed after the run with "TypeError: Converting
 * circular structure to JSON ... property '_impl' -> ... 'node' closes the circle" and wrote no
 * --json report; plus 26 tests whose real failure is hidden behind "TypeError: Cannot assign to
 * read only property 'type' | 'props' | 'cellProps' | 'style' of object '#<Object>'", thrown
 * while Jest formats a failed `expect(document.activeElement).toBe(cell)` / `toEqual` diff).
 *
 * @ctrl/dom wrappers keep their internals as enumerable own string-keyed properties (`_impl`,
 * `_listeners`, `_childNodes`, ... on nodes; `_s`, `_view`, ... on events). Anything that walks
 * own enumerable keys — JSON.stringify, Jest's equality/diff/pretty-format, structured logging —
 * walks into NodeImpl records (cyclic: impl.node -> wrapper) and React's frozen element objects
 * reachable from them. jsdom keeps the impl behind a symbol, so `Object.keys(node)` is `[]`.
 *
 * Owner: dom-core (make wrapper internals non-enumerable — e.g. define them once in the
 * constructor with enumerable: false, or use #private/symbol keys — without hurting hidden-class
 * stability).
 */
import { describe, expect, test } from "vitest";
import { windows } from "./engines.ts";

describe.each(["jsdom", "ctrl-dom"] as const)("%s", (engine) => {
  test("a connected element has no own enumerable properties", () => {
    const { document } = windows[engine]();
    const button = document.createElement("button");
    document.body.append(button);
    button.addEventListener("click", () => {});
    expect(Object.keys(button)).toEqual([]);
  });

  test("JSON.stringify of an object holding an element does not throw (Jest --json failureDetails)", () => {
    const { document } = windows[engine]();
    const button = document.createElement("button");
    document.body.append(button);
    expect(() => JSON.stringify({ error: { actual: button } })).not.toThrow();
  });

});
