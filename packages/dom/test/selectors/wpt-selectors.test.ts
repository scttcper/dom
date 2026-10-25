/**
 * Selectors — web-platform-tests css/selectors and html/semantics/selectors, run unmodified
 * through test/wpt/harness.ts (vendored at web-platform-tests/wpt@d9c2fe5 under
 * test/wpt/fixtures/<same path>; known failures in test/wpt/expectations/css.json).
 *
 * Specs:
 *   Selectors Level 4 — https://drafts.csswg.org/selectors-4/
 *     §3 structure / parsing, forgiving lists: https://drafts.csswg.org/selectors-4/#forgiving-selector
 *     §6.3 attribute case-sensitivity: https://drafts.csswg.org/selectors-4/#attribute-case
 *     §4 logical combinations (:is/:where/:not/:has): https://drafts.csswg.org/selectors-4/#logical-combination
 *     featureless elements (:host): https://drafts.csswg.org/selectors-4/#featureless
 *   CSS Conditional 4 selector(): https://drafts.csswg.org/css-conditional-4/#support-definition-ext
 *   CSS Nesting (&): https://drafts.csswg.org/css-nesting-1/#nest-selector
 *   CSS Namespaces: https://drafts.csswg.org/css-namespaces-3/#css-qnames
 *   HTML §4.16 Selectors (pseudo-classes, case-sensitivity): https://html.spec.whatwg.org/#selectors
 *
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/css/selectors and
 * https://github.com/web-platform-tests/wpt/tree/master/html/semantics/selectors (3-clause BSD).
 * Not vendored: tests that need layout (i18n :lang via offsetWidth), WebDriver input
 * (focus-visible-*, :active/:hover, :user-valid — they belong with @ctrl/dom/user-event's testdriver),
 * media playback, fullscreen, and markup iframes. The older subset in ./wpt-runner.test.ts stays.
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

describe("Selectors 4 \u00a73 parsing + CSS Conditional 4 selector() (https://drafts.csswg.org/selectors-4/#structure)", () => {
    defineWPT("css/selectors/parsing/invalid-pseudos.html");
    defineWPT("css/selectors/parsing/parse-anplusb.html");
    defineWPT("css/selectors/parsing/parse-attribute.html");
    defineWPT("css/selectors/parsing/parse-child.html");
    defineWPT("css/selectors/parsing/parse-class.html");
    defineWPT("css/selectors/parsing/parse-descendant.html");
    defineWPT("css/selectors/parsing/parse-focus-visible.html");
    defineWPT("css/selectors/parsing/parse-has-disallow-nesting-has-inside-has.html");
    defineWPT("css/selectors/parsing/parse-has-forgiving-selector.html");
    defineWPT("css/selectors/parsing/parse-has.html");
    defineWPT("css/selectors/parsing/parse-heading.html");
    defineWPT("css/selectors/parsing/parse-id.html");
    defineWPT("css/selectors/parsing/parse-is-where.html");
    defineWPT("css/selectors/parsing/parse-is.html");
    defineWPT("css/selectors/parsing/parse-not.html");
    defineWPT("css/selectors/parsing/parse-part.html");
    defineWPT("css/selectors/parsing/parse-sibling.html");
    defineWPT("css/selectors/parsing/parse-slotted.html");
    defineWPT("css/selectors/parsing/parse-state.html");
    defineWPT("css/selectors/parsing/parse-universal.html");
    defineWPT("css/selectors/parsing/parse-where.html");
});

describe("Selectors 4 \u00a76.3 attribute selectors and case-sensitivity (https://drafts.csswg.org/selectors-4/#attribute-case)", () => {
    defineWPT("css/selectors/attribute-selectors/attribute-case/cssom.html");
    defineWPT("css/selectors/attribute-selectors/attribute-case/semantics.html", "markup <iframe src> documents / cross-document cases are not emulated by the harness");
    defineWPT("css/selectors/attribute-selectors/attribute-case/syntax.html", "markup <iframe src> documents / cross-document cases are not emulated by the harness");
    defineWPT("css/selectors/attribute-selectors/style-attribute-selector.html");
});

describe("Selectors 4 \u00a714 :has() and dynamic style invalidation through getComputedStyle (https://drafts.csswg.org/selectors-4/#relational)", () => {
    defineWPT("css/selectors/invalidation/any-link-pseudo.html");
    defineWPT("css/selectors/invalidation/attribute.html");
    defineWPT("css/selectors/invalidation/child-indexed-pseudo-classes-in-has.html");
    defineWPT("css/selectors/invalidation/defined-in-has.html");
    defineWPT("css/selectors/invalidation/defined.html");
    defineWPT("css/selectors/invalidation/empty-pseudo-in-has-display-none.html", "needs layout (no layout engine, docs/deviations.md)");
    defineWPT("css/selectors/invalidation/empty-pseudo-in-has.html");
    defineWPT("css/selectors/invalidation/enabled-disabled.html");
    defineWPT("css/selectors/invalidation/first-child-last-child.html");
    defineWPT("css/selectors/invalidation/has-complexity.html");
    defineWPT("css/selectors/invalidation/has-css-nesting-shared.html");
    defineWPT("css/selectors/invalidation/has-in-adjacent-position.html");
    defineWPT("css/selectors/invalidation/has-in-ancestor-position.html");
    defineWPT("css/selectors/invalidation/has-in-is-non-subject-compound.html");
    defineWPT("css/selectors/invalidation/has-in-parent-position.html");
    defineWPT("css/selectors/invalidation/has-in-sibling-position.html");
    defineWPT("css/selectors/invalidation/has-invalidation-after-removing-non-first-element.html");
    defineWPT("css/selectors/invalidation/has-invalidation-first-in-sibling-chain.html");
    defineWPT("css/selectors/invalidation/has-pseudo-element-subject-child-mutation.html");
    defineWPT("css/selectors/invalidation/has-pseudoclass-only.html");
    defineWPT("css/selectors/invalidation/has-sibling-insertion-removal.html");
    defineWPT("css/selectors/invalidation/has-sibling.html");
    defineWPT("css/selectors/invalidation/has-side-effect.html");
    defineWPT("css/selectors/invalidation/has-unstyled.html");
    defineWPT("css/selectors/invalidation/has-with-is-child-combinator.html");
    defineWPT("css/selectors/invalidation/has-with-nesting-parent-containing-complex.html");
    defineWPT("css/selectors/invalidation/has-with-not.html");
    defineWPT("css/selectors/invalidation/has-with-nth-child.html");
    defineWPT("css/selectors/invalidation/has-with-pseudo-class.html");
    defineWPT("css/selectors/invalidation/heading-pseudo-class-in-has-with-headingoffset.html", "headingOffset/headingReset IDL attributes are not reflected yet (html area); the attributes themselves work");
    defineWPT("css/selectors/invalidation/heading-pseudo-class-in-has.html");
    defineWPT("css/selectors/invalidation/host-context-pseudo-class-in-has.html");
    defineWPT("css/selectors/invalidation/host-pseudo-class-in-has.html");
    defineWPT("css/selectors/invalidation/input-in-range-in-has-with-readonly.html");
    defineWPT("css/selectors/invalidation/input-pseudo-classes-in-has.html");
    defineWPT("css/selectors/invalidation/insert-sibling-001.html");
    defineWPT("css/selectors/invalidation/insert-sibling-002.html");
    defineWPT("css/selectors/invalidation/insert-sibling-003.html");
    defineWPT("css/selectors/invalidation/insert-sibling-004.html");
    defineWPT("css/selectors/invalidation/is-pseudo-containing-complex-in-has.html");
    defineWPT("css/selectors/invalidation/is-pseudo-containing-sibling-relationship-in-has.html");
    defineWPT("css/selectors/invalidation/is-where-pseudo-containing-hard-pseudo-and-never-matching.html");
    defineWPT("css/selectors/invalidation/is-where-pseudo-containing-hard-pseudo.html");
    defineWPT("css/selectors/invalidation/is.html");
    defineWPT("css/selectors/invalidation/link-pseudo-class-in-has.html");
    defineWPT("css/selectors/invalidation/link-pseudo-in-has.html");
    defineWPT("css/selectors/invalidation/location-pseudo-classes-in-has.html");
    defineWPT("css/selectors/invalidation/not-001.html");
    defineWPT("css/selectors/invalidation/not-002.html");
    defineWPT("css/selectors/invalidation/not-pseudo-containing-complex-in-has.html");
    defineWPT("css/selectors/invalidation/not-pseudo-containing-sibling-relationship-in-has.html");
    defineWPT("css/selectors/invalidation/nth-child-whole-subtree.html");
    defineWPT("css/selectors/invalidation/open-pseudo-class-in-has.html", "needs WebDriver input via test_driver (run with @ctrl/dom/user-event's testdriver in packages/user-event)");
    defineWPT("css/selectors/invalidation/placeholder-shown.html");
    defineWPT("css/selectors/invalidation/quirks-mode-stylesheet-dynamic-add-001.html");
    defineWPT("css/selectors/invalidation/selectorText-dynamic-001.html");
    defineWPT("css/selectors/invalidation/sheet-going-away-001.html");
    defineWPT("css/selectors/invalidation/sibling.html");
    defineWPT("css/selectors/invalidation/state-in-has.html");
    defineWPT("css/selectors/invalidation/subject-has-invalidation-with-display-none-anchor-element.html");
    defineWPT("css/selectors/invalidation/target-pseudo-in-has.html");
    defineWPT("css/selectors/invalidation/typed-child-indexed-pseudo-classes-in-has.html");
    defineWPT("css/selectors/invalidation/where.html");
});

describe("Selectors 4 (https://drafts.csswg.org/selectors-4/)", () => {
    defineWPT("css/selectors/class-selector-escape-exclamation.html");
    defineWPT("css/selectors/dir-pseudo-on-input-element.html");
    defineWPT("css/selectors/featureless-006.html");
    defineWPT("css/selectors/featureless-007.html");
    defineWPT("css/selectors/focus-in-focus-event-001.html");
    defineWPT("css/selectors/focus-in-focusin-event-001.html");
    defineWPT("css/selectors/focus-visible-010.html");
    defineWPT("css/selectors/focus-visible-014.html");
    defineWPT("css/selectors/focus-visible-017.html", "the UA style sheet has no :focus-visible focus ring (docs/deviations.md)");
    defineWPT("css/selectors/focus-visible-018-2.html");
    defineWPT("css/selectors/focus-visible-020.html");
    defineWPT("css/selectors/focus-visible-023.html");
    defineWPT("css/selectors/focus-visible-026.html", "needs WebDriver input via test_driver (run with @ctrl/dom/user-event's testdriver in packages/user-event)");
    defineWPT("css/selectors/focus-visible-script-focus-001.html");
    defineWPT("css/selectors/focus-within-009.html");
    defineWPT("css/selectors/has-specificity.html");
    defineWPT("css/selectors/has-where-computed.html");
    defineWPT("css/selectors/hash-collision-cssom.html");
    defineWPT("css/selectors/hash-collision.html");
    defineWPT("css/selectors/heading-prefixed.html");
    defineWPT("css/selectors/is-nested.html");
    defineWPT("css/selectors/is-specificity-shadow.html");
    defineWPT("css/selectors/is-specificity.html");
    defineWPT("css/selectors/is-where-error-recovery.html");
    defineWPT("css/selectors/is-where-pseudo-classes.html");
    defineWPT("css/selectors/is-where-shadow.html", "::slotted() rules are not applied by the cascade");
    defineWPT("css/selectors/modal-pseudo-class.html", "needs WebDriver input via test_driver (run with @ctrl/dom/user-event's testdriver in packages/user-event)");
    defineWPT("css/selectors/not-specificity.html");
    defineWPT("css/selectors/nth-last-child-invalid.html");
    defineWPT("css/selectors/nth-of-type-namespace.html");
    defineWPT("css/selectors/open-pseudo.html", "needs WebDriver input via test_driver (run with @ctrl/dom/user-event's testdriver in packages/user-event)");
    defineWPT("css/selectors/placeholder-shown.html");
    defineWPT("css/selectors/quirks-mode-import.html");
    defineWPT("css/selectors/selector-after-font-family.html");
    defineWPT("css/selectors/selector-placeholder-shown-emptify-placeholder.html");
    defineWPT("css/selectors/selector-specificity.html");
    defineWPT("css/selectors/selectors-attr-many-2.html");
    defineWPT("css/selectors/webkit-pseudo-element.html", "unknown ::-webkit-* pseudo-elements make the selector invalid instead of being kept");
    defineWPT("css/selectors/x-pseudo-element.html");
});

describe("HTML \u00a74.16 Selectors: pseudo-classes and case-sensitivity (https://html.spec.whatwg.org/#selectors)", () => {
    defineWPT("html/semantics/selectors/case-sensitivity/values.window.js");
    defineWPT("html/semantics/selectors/pseudo-classes/autofill.html");
    defineWPT("html/semantics/selectors/pseudo-classes/checked-002.html");
    defineWPT("html/semantics/selectors/pseudo-classes/checked-after-clone.html");
    defineWPT("html/semantics/selectors/pseudo-classes/checked-indeterminate.window.js");
    defineWPT("html/semantics/selectors/pseudo-classes/checked-type-change.html");
    defineWPT("html/semantics/selectors/pseudo-classes/checked.html");
    defineWPT("html/semantics/selectors/pseudo-classes/default.html");
    defineWPT("html/semantics/selectors/pseudo-classes/dir-dynamic.html");
    defineWPT("html/semantics/selectors/pseudo-classes/dir-html-input-dynamic-text.html");
    defineWPT("html/semantics/selectors/pseudo-classes/dir.html");
    defineWPT("html/semantics/selectors/pseudo-classes/dir01.html");
    defineWPT("html/semantics/selectors/pseudo-classes/disabled.html", "html/forms predicate: :disabled for controls appended to a disabled fieldset (html/forms/state.ts)");
    defineWPT("html/semantics/selectors/pseudo-classes/enabled.html");
    defineWPT("html/semantics/selectors/pseudo-classes/indeterminate-radio.html");
    defineWPT("html/semantics/selectors/pseudo-classes/indeterminate-type-change.html");
    defineWPT("html/semantics/selectors/pseudo-classes/indeterminate.html");
    defineWPT("html/semantics/selectors/pseudo-classes/inrange-outofrange-time-reversed.html");
    defineWPT("html/semantics/selectors/pseudo-classes/inrange-outofrange-type-change.html");
    defineWPT("html/semantics/selectors/pseudo-classes/inrange-outofrange.html");
    defineWPT("html/semantics/selectors/pseudo-classes/link.html");
    defineWPT("html/semantics/selectors/pseudo-classes/placeholder-shown-type-change.html");
    defineWPT("html/semantics/selectors/pseudo-classes/readwrite-readonly-type-change.html");
    defineWPT("html/semantics/selectors/pseudo-classes/readwrite-readonly.html", "html/forms predicate: :read-write for contenteditable editing hosts (html/forms/state.ts)");
    defineWPT("html/semantics/selectors/pseudo-classes/required-optional-hidden.html");
    defineWPT("html/semantics/selectors/pseudo-classes/required-optional.html");
    defineWPT("html/semantics/selectors/pseudo-classes/valid-invalid-fieldset-disconnected.html");
    defineWPT("html/semantics/selectors/pseudo-classes/valid-invalid.html");
});
