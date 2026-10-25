/**
 * Downstream repro — environment difference (Sentry: logFileViewer.spec.tsx ×4,
 * eventAttachments.spec.tsx "can open attachment previews"; any spec that registers
 * `fetchMock.route('/relative/url', ...)`).
 *
 * jest-fetch-mock 4 uses the environment's own fetch primitives when `fetch`, `Request`,
 * `Response` and `Headers` all exist, and falls back to cross-fetch otherwise
 * ("jest-environment-jsdom still ships no fetch"). Its string routes match with
 * `request.url === route`. With cross-fetch (Sentry's jsdom baseline) a relative URL stays
 * relative and matches; with native (undici) Request the URL is resolved to
 * "http://localhost/..." and the route never matches, so the component gets the default empty
 * response. @ctrl/dom's window exposes the host's fetch/Request/Response/Headers
 * (window/Window.ts HOST_DELEGATES), jsdom's window does not.
 *
 * Not a spec bug (browsers have fetch); the owner decides between jsdom parity under Jest
 * (an environment option to hide the fetch family), documenting it in docs/deviations.md, or
 * leaving it to jest-fetch-mock (its relative-route matching is broken on jest-environment-node
 * too). Owner: window (+ jest-environment for an option).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("fetch primitives on the window", (make) => {
  test("fetch/Request/Response absent, like jsdom (so fetch mocks pick their polyfill)", () => {
    const window = make();
    // jsdom does implement Headers (WHATWG Fetch Headers) but not fetch/Request/Response.
    expect([typeof window.fetch, typeof window.Request, typeof window.Response]).toEqual([
      "undefined",
      "undefined",
      "undefined",
    ]);
  });
});
