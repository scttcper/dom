/**
 * WPT accessibility suites — wai-aria, accname, html-aam — run unmodified through
 * packages/dom/test/wpt/harness.ts with a `test_driver` backed by @rtd/aria
 * (test/wpt-testdriver.ts: `get_computed_role` → Testing Library's role for the element,
 * `get_computed_label` → `computeAccessibleName`).
 *
 * Specs:
 *   - Core Accessibility API Mappings — https://w3c.github.io/core-aam/
 *   - HTML Accessibility API Mappings — https://w3c.github.io/html-aam/
 *     (element role mappings: https://w3c.github.io/html-aam/#html-element-role-mappings,
 *      name computation: https://w3c.github.io/html-aam/#accessible-name-computations-by-html-element)
 *   - Accessible Name and Description Computation — https://w3c.github.io/accname/
 *     (https://w3c.github.io/accname/#computation-steps)
 *   - WAI-ARIA — https://w3c.github.io/aria/
 *     (roles: https://w3c.github.io/aria/#role_definitions, author errors:
 *      https://w3c.github.io/aria/#document-handling_author-errors_roles, presentational conflict
 *      resolution: https://w3c.github.io/aria/#conflict_resolution_presentation_none)
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/wai-aria,
 *   .../accname, .../html-aam (BSD-3-Clause), vendored under packages/dom/test/wpt/fixtures.
 *
 * Drop-in compatibility comes first: @rtd/aria must produce exactly what stock Testing Library
 * (aria-query@5.3.0 + dom-accessibility-api@0.5.16 on jsdom) produces. Every known failure in
 * packages/dom/test/wpt/expectations/aria.json was checked against that oracle and is a case
 * where WPT (Chromium-style computed roles / current specs) and stock Testing Library disagree;
 * the reasons below say how. They are registered with `test.fails`, so a change that makes one
 * pass — i.e. diverges from stock Testing Library — turns the suite red.
 */
import { defineWPT, wptFiles } from "../../dom/test/wpt/harness.ts";
import { ariaTestDriver } from "./wpt-testdriver.ts";

/** "(d) …": matches aria-query / dom-accessibility-api for drop-in compatibility. */
const D = "(d) matches stock Testing Library for drop-in compatibility:";
const ROLE_VERBATIM = `${D} *ByRole matches the first role token as written — no fallback to the next valid token, no case folding, abstract/unknown roles are not ignored`;

const reasons: Record<string, string> = {
  // wai-aria/role
  "wai-aria/role/abstract-roles.html": ROLE_VERBATIM,
  "wai-aria/role/fallback-roles.html": ROLE_VERBATIM,
  "wai-aria/role/invalid-roles.html": ROLE_VERBATIM,
  "wai-aria/role/roles.html": ROLE_VERBATIM,
  "wai-aria/role/form-roles.html": `${D} an explicit role=form/region keeps its role without an accessible name`,
  "wai-aria/role/region-roles.html": `${D} an explicit role=form/region keeps its role without an accessible name`,
  "wai-aria/role/role_none_conflict_resolution.html": `${D} role=none is taken as written; no presentational-roles conflict resolution for global ARIA attributes or focusable elements`,
  "wai-aria/role/synonym-roles.html": `${D} aria-query@5.3.0 does not fold the deprecated "directory" role into "list"`,
  // accname
  "accname/aria-owns.html": `${D} dom-accessibility-api@0.5.16 adds aria-owns targets as children without removing them from their DOM parent's name, and ignores hidden ancestors of owned elements`,
  "accname/name/comp_embedded_control.html": `${D} an embedded ARIA combobox (span/div) contributes no value in dom-accessibility-api@0.5.16`,
  "accname/name/comp_hidden_not_referenced.html": `${D} visibility:visible descendants of a visibility:hidden element are skipped`,
  "accname/name/comp_label.html": `${D} hidden aria-labelledby targets are not traversed, and names are trimmed with String#trim (strips U+00A0)`,
  "accname/name/comp_labelledby_hidden_nodes.html": `${D} visibility:hidden/collapse descendants of aria-labelledby targets are handled like dom-accessibility-api@0.5.16`,
  "accname/name/comp_name_from_content.html": `${D} Testing Library calls dom-accessibility-api without pseudo-element support (no ::before/::after content); CSS counters and text-transform need rendering`,
  "accname/name/comp_text_node.html": `${D} U+00A0 is collapsed like ASCII whitespace and nested inline whitespace is not joined`,
  "accname/name/shadowdom/basic.html": `${D} dom-accessibility-api@0.5.16 does not look into shadow trees`,
  "accname/name/shadowdom/slot.html": `${D} dom-accessibility-api@0.5.16 does not compute names over the flat tree (shadow trees / slots)`,
  // html-aam/accname-computation-by-element
  "html-aam/accname-computation-by-element/area.html": `${D} <area> is display:none in the UA stylesheet (jsdom's and ours), so it is hidden and nameless`,
  "html-aam/accname-computation-by-element/img.html": `${D} an <img> is not named from its ancestor <figure>'s <figcaption>`,
  "html-aam/accname-computation-by-element/input-button-submit-reset.html": `${D} button-type inputs are named from value before <label>`,
  "html-aam/accname-computation-by-element/input-image.html": `${D} an empty alt on input[type=image] falls through to title`,
  "html-aam/accname-computation-by-element/inputs-with-placeholders.html": `${D} placeholder / aria-placeholder are not name sources in dom-accessibility-api@0.5.16`,
  "html-aam/accname-computation-by-element/phrasing-elements.html": `${D} <rp> is display:none in the UA stylesheet, so it is hidden and nameless`,
  "html-aam/accname-computation-by-element/section-and-grouping-elements.html": `${D} a closed <dialog> is display:none, so it is hidden and nameless`,
  // html-aam
  "html-aam/aside-in-prefixed-article.html": `${D} aria-query@5.3.0 implicit roles ignore context (aside is always complementary)`,
  "html-aam/hidden-names.html": `${D} the first <caption>/<legend> names the table/fieldset even when hidden`,
  "html-aam/roles-contextual.html": `${D} aria-query@5.3.0 implicit roles ignore context and name constraints (aside, section[title]), and <img alt=""> stays presentation even with aria-label`,
  "html-aam/roles.html": `${D} aria-query@5.3.0 predates the hgroup→group, s→deletion and search→search mappings`,
  "html-aam/table-roles.html": `${D} aria-query@5.3.0 maps every <th> without scope to columnheader`,
};

const options = { testdriver: ariaTestDriver };
for (const dir of [
  "wai-aria/role",
  "wai-aria/heading",
  "accname",
  "accname/name",
  "accname/name/shadowdom",
  "html-aam",
  "html-aam/accname-computation-by-element",
  "html-aam/heading",
]) {
  for (const file of wptFiles(dir)) defineWPT(file, reasons[file] ?? "", options);
}
