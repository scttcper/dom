/**
 * History and Location — web-platform-tests html/browsers/history, run unmodified through
 * test/wpt/harness.ts.
 *
 * Spec: HTML Standard §7.4 "Navigation and session history"
 *   - The History interface: https://html.spec.whatwg.org/#the-history-interface
 *   - Shared history push/replace state steps: https://html.spec.whatwg.org/#shared-history-push/replace-state-steps
 *   - The Location interface: https://html.spec.whatwg.org/#the-location-interface
 *   - Location object setup steps: https://html.spec.whatwg.org/#location-object-setup-steps
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/html/browsers/history
 *
 * Only same-document behavior is vendored. Not vendored (docs/deviations.md "Navigation never
 * loads a document"): tests that wait for a navigation or traversal to load a document
 * (history_back_1, history_go_*, traverse_the_history_*, joint_session_history, assign/reload/
 * replace *_session_history, scripted_*_during_load, location-protocol-setter-non-broken*,
 * location-pathname-setter-question-mark, iframe_history_go_0, *.optional rate-limit tests),
 * window.open / cross-origin / sandboxed iframes (location-replace-cross-site, *_cross_realm_method,
 * security_location_0, history_pushstate_url_rewriting), the Navigation API
 * (create-script-set-location), referrer policy (location-ancestor-origins-referrerpolicy-*),
 * document encodings (location-encoding-parse), document.open/bfcache (per-global, reload_document_*,
 * history-associated-with-document, history-state-after-bfcache) and layout (same-hash).
 * location-protocol-setter-non-broken-weird passes but waits 4 s per subtest.
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

const H = "html/browsers/history/the-history-interface";
const L = "html/browsers/history/the-location-interface";

describe("The History interface — https://html.spec.whatwg.org/#the-history-interface", () => {
  for (const name of [
    "006",
    "007",
    "011",
    "012",
    "back-pushstate-back-history-state",
    "combination_history_001",
    "combination_history_002",
    "combination_history_003",
    "combination_history_004",
    "combination_history_005",
    "combination_history_006",
    "combination_history_007",
    "history_back",
    "history_forward",
    "history_go_minus",
    "history_go_plus",
    "history_properties_only_fully_active",
    "history_pushstate",
    "history_pushstate_err",
    "history_pushstate_nooptionalparam",
    "history_pushstate_url",
    "history_replacestate",
    "history_replacestate_err",
    "history_replacestate_nooptionalparam",
    "history_state",
  ]) {
    defineWPT(`${H}/${name}.html`);
  }
  for (const method of ["pushstate", "replacestate"]) {
    for (const variant of ["", "-base", "-whitespace"])
      defineWPT(`${H}/pushstate-replacestate-empty-string/${method}${variant}.html`);
  }
  defineWPT("html/browsers/history/joint-session-history/joint-session-history-iframe-state.html");
});

describe("The Location interface — https://html.spec.whatwg.org/#the-location-interface", () => {
  for (const name of [
    "location-ancestor-origins-new-object",
    "location-getters-about-blank",
    "location-hash-about-blank",
    "location-hash-setter-empty-string",
    "location-non-configurable-toString-valueOf",
    "location-prototype-no-toString-valueOf",
    "location-symbol-toprimitive",
    "location-tojson",
    "location_assign",
    "location_hash_set_empty_string",
    "location_hashchange_infinite_loop",
    "location_host",
    "location_hostname",
    "location_href",
    "location_origin",
    "location_pathname",
    "location_port",
    "location_protocol",
    "location_replace",
  ]) {
    defineWPT(`${L}/${name}.html`);
  }
  defineWPT(`${L}/no-browsing-context.window.js`);
  defineWPT(
    `${L}/location-protocol-setter.html`,
    "the data: URL / srcdoc iframe subtest needs postMessage from a loaded document",
    { timeout: 300 },
  );
  const EXOTIC =
    "Location is not an exotic object: [[SetPrototypeOf]] / [[PreventExtensions]] are ordinary (deviation)";
  defineWPT(`${L}/location-prototype-setting-same-origin.html`, EXOTIC);
  defineWPT(
    `${L}/location-stringifier.html`,
    "href and the other members are configurable prototype accessors, not [LegacyUnforgeable] own properties (deviation)",
  );
  defineWPT(
    `${L}/location-valueof.html`,
    "harness: the test's Object.prototype.valueOf comes from the vm context's realm, ours from the main realm",
  );
  defineWPT(`${L}/location_hash.html`, "fragment navigation does not scroll (no layout)");
  defineWPT(`${L}/location_search.html`, "navigating an about:blank iframe never fires load (no navigation)");
});
