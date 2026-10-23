/**
 * Downstream repro (Base UI: FloatingFocusManager "JSDOM-only coverage iframe focus navigation"
 * x2 and ToastViewport "rebinds owner-document listeners" x1; 3 failures in both rtd modes).
 *
 * A connected `<iframe>` gets a nested browsing context with its own window/document in jsdom
 * (`contentWindow`, `contentDocument` of about:blank). @rtd/dom documents "no nested browsing
 * context" (docs/deviations.md), so tests that render into an iframe document throw
 * "Expected iframe window and document".
 *
 * Spec: https://html.spec.whatwg.org/#the-iframe-element (create a new child navigable on
 * insertion; initial about:blank document)
 * Owner: html-elements + window (decide: minimal about:blank child window, or keep deviation).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("iframe has an about:blank content document", (make) => {
  test("contentWindow / contentDocument exist after insertion", () => {
    const { document } = make();
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    expect(iframe.contentWindow).toBeTruthy();
    expect(iframe.contentDocument?.body).toBeTruthy();
  });
});
