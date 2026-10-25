/**
 * CSSOM — web-platform-tests css/cssom and the non-layout part of css/cssom-view, run unmodified
 * through test/wpt/harness.ts (vendored at web-platform-tests/wpt@d9c2fe5 under
 * test/wpt/fixtures/<same path>; known failures in test/wpt/expectations/css.json).
 *
 * Specs:
 *   CSSOM — https://drafts.csswg.org/cssom/
 *     §6.1 CSSStyleSheet (constructable, replace): https://drafts.csswg.org/cssom/#the-cssstylesheet-interface
 *     §6.4 CSS rules / serialization: https://drafts.csswg.org/cssom/#css-rules
 *     §6.6 CSSStyleDeclaration (setProperty, cssText): https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface
 *     §6.4.2 serializing selectors: https://drafts.csswg.org/cssom/#serializing-selectors
 *     §9 getComputedStyle: https://drafts.csswg.org/cssom/#extensions-to-the-window-interface
 *   CSSOM View §4 MediaQueryList / scrolling arguments: https://drafts.csswg.org/cssom-view/
 *   CSS Cascade 5 (shorthands in the cascade): https://drafts.csswg.org/css-cascade-5/#shorthand
 *
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/css/cssom and
 * https://github.com/web-platform-tests/wpt/tree/master/css/cssom-view (3-clause BSD).
 * Not vendored: layout (insets, caretPositionFromPoint, percentage resolution), network
 * (@import, <link> loads), real iframes, and cssom-view geometry. The older subset in
 * ./wpt.test.ts stays.
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

describe("CSSOM (https://drafts.csswg.org/cssom/)", () => {
  defineWPT("css/cssom/CSS-escape-numeric-id.html");
  defineWPT("css/cssom/CSS-namespace-object-class-string.html");
  defineWPT("css/cssom/CSS-supports.html");
  defineWPT("css/cssom/CSSConditionRule-conditionText.html");
  defineWPT("css/cssom/CSSFontFaceRule.html");
  defineWPT("css/cssom/CSSGroupingRule-insertRule-computed.html");
  defineWPT("css/cssom/CSSKeyframeRule-keyText-edge-cases.html");
  defineWPT("css/cssom/CSSKeyframeRule-keyText.html");
  defineWPT("css/cssom/CSSKeyframeRule.html", "CSSKeyframeRule.style [PutForwards] assignment is not implemented");
  defineWPT("css/cssom/CSSKeyframesRule-appendRule-invalid.html");
  defineWPT("css/cssom/CSSKeyframesRule-appendRule-multiple.html");
  defineWPT("css/cssom/CSSKeyframesRule-deleteRule-detach.html");
  defineWPT(
    "css/cssom/CSSKeyframesRule-indexed-getter.html",
    "CSSKeyframesRule has no indexed getter (would need a Proxy)",
  );
  defineWPT("css/cssom/CSSNamespaceRule.html");
  defineWPT("css/cssom/CSSRule-type.html", "@counter-style (CSSCounterStyleRule) is not implemented");
  defineWPT("css/cssom/CSSStyleDeclaration-indexed-properties.html");
  defineWPT("css/cssom/CSSStyleDeclaration-iterator.html");
  defineWPT("css/cssom/CSSStyleRule-selectorText-setter.html");
  defineWPT("css/cssom/CSSStyleRule-set-selectorText-namespace.html");
  defineWPT("css/cssom/CSSStyleRule.html");
  defineWPT("css/cssom/CSSStyleSheet-constructable-cssRules.html");
  defineWPT("css/cssom/CSSStyleSheet-constructable-disabled-regular-sheet-insertion.html");
  defineWPT("css/cssom/CSSStyleSheet-constructable-duplicate.html");
  defineWPT("css/cssom/CSSStyleSheet-constructable-invalidation.html");
  defineWPT("css/cssom/CSSStyleSheet-constructable-replace-cssRules.html");
  defineWPT("css/cssom/CSSStyleSheet-constructable-replace-thenable.html");
  defineWPT("css/cssom/CSSStyleSheet-insertRule-computed.html");
  defineWPT("css/cssom/CSSStyleSheet-replace-detach-old-rules.html");
  defineWPT("css/cssom/CSSStyleSheet-replace-parse-errors.html");
  defineWPT("css/cssom/MediaList-parsing.html");
  defineWPT("css/cssom/MediaList.html");
  defineWPT("css/cssom/MutationObserver-style.html");
  defineWPT("css/cssom/StyleSheet-properties.html", "@import / <link> style sheets are not fetched (no network)");
  defineWPT("css/cssom/StyleSheetList-constructable-shadow-with-style-recalc.html");
  defineWPT("css/cssom/StyleSheetList-constructable-shadow.html");
  defineWPT("css/cssom/StyleSheetList-constructable-with-style-recalc.html");
  defineWPT("css/cssom/StyleSheetList-constructable.html");
  defineWPT("css/cssom/StyleSheetList.html");
  defineWPT("css/cssom/adoptedstylesheets-cascade-order.html");
  defineWPT("css/cssom/adoptedstylesheets-modify-array-and-sheet.html");
  defineWPT("css/cssom/adoptedstylesheets-observablearray-removal.html");
  defineWPT("css/cssom/at-namespace.html");
  defineWPT(
    "css/cssom/computed-style-001.html",
    "needs layout (percentages are not resolved); assigning on computed declarations is ignored (docs/deviations.md)",
  );
  defineWPT(
    "css/cssom/computed-style-set-property.html",
    "assigning on computed declarations is ignored instead of throwing (docs/deviations.md)",
  );
  defineWPT("css/cssom/css-rule-selector-text.html");
  defineWPT("css/cssom/css-style-attr-decl-block.html", "url() values are not resolved against the document base URL");
  defineWPT("css/cssom/css-style-attribute-modifications.html");
  defineWPT("css/cssom/css-style-declaration-modifications.html");
  defineWPT("css/cssom/css-style-reparse.html");
  defineWPT("css/cssom/cssimportrule.html", "@import / <link> style sheets are not fetched (no network)");
  defineWPT(
    "css/cssom/cssom-getPropertyValue-common-checks.html",
    "computed serialization of some rarely used longhands' initial values differs from browsers",
  );
  defineWPT(
    "css/cssom/cssom-pagerule.html",
    "@page selector validation is lenient (pseudo-page names / whitespace accepted)",
  );
  defineWPT("css/cssom/cssom-ruleTypeAndOrder.html");
  defineWPT(
    "css/cssom/cssstyledeclaration-csstext-all-shorthand.html",
    "the `all` shorthand is stored as one declaration (not expanded into every longhand)",
  );
  defineWPT("css/cssom/cssstyledeclaration-csstext-setter.window.js");
  defineWPT("css/cssom/cssstyledeclaration-mutationrecord-001.html");
  defineWPT("css/cssom/cssstyledeclaration-mutationrecord-002.html");
  defineWPT("css/cssom/cssstyledeclaration-mutationrecord-003.html");
  defineWPT("css/cssom/cssstyledeclaration-mutationrecord-004.html");
  defineWPT("css/cssom/cssstyledeclaration-mutationrecord-005.html");
  defineWPT(
    "css/cssom/cssstyledeclaration-removeProperty-all.html",
    "the `all` shorthand is stored as one declaration (not expanded into every longhand)",
  );
  defineWPT("css/cssom/cssstyledeclaration-setter-attr.html");
  defineWPT("css/cssom/cssstyledeclaration-setter-declarations.html");
  defineWPT("css/cssom/cssstyledeclaration-setter-form-controls.html");
  defineWPT("css/cssom/font-shorthand-serialization.html");
  defineWPT(
    "css/cssom/getComputedStyle-basic.html",
    "getComputedStyle() reuses one live object per element (docs/deviations.md)",
  );
  defineWPT("css/cssom/getComputedStyle-display-none-002.html");
  defineWPT("css/cssom/getComputedStyle-display-none-003.html");
  defineWPT("css/cssom/getComputedStyle-display-none-shadow-invalidation.html");
  defineWPT("css/cssom/getComputedStyle-important.html");
  defineWPT("css/cssom/getComputedStyle-line-height.html", "needs layout (no layout engine, docs/deviations.md)");
  defineWPT("css/cssom/getComputedStyle-live.html");
  defineWPT("css/cssom/getComputedStyle-logical-enumeration.html");
  defineWPT("css/cssom/getComputedStyle-margins-roundtrip.html");
  defineWPT("css/cssom/getComputedStyle-mutations.html");
  defineWPT("css/cssom/getComputedStyle-pointerEvents.html");
  defineWPT("css/cssom/getComputedStyle-property-order.html");
  defineWPT(
    "css/cssom/getComputedStyle-pseudo-checkmark.html",
    "pseudo-elements other than ::before/::after (::checkmark, ::picker-icon, ::picker(), ::highlight()) have no computed style",
  );
  defineWPT("css/cssom/getComputedStyle-pseudo-class.html");
  defineWPT(
    "css/cssom/getComputedStyle-pseudo-picker-icon.html",
    "pseudo-elements other than ::before/::after (::checkmark, ::picker-icon, ::picker(), ::highlight()) have no computed style",
  );
  defineWPT(
    "css/cssom/getComputedStyle-pseudo-picker.html",
    "pseudo-elements other than ::before/::after (::checkmark, ::picker-icon, ::picker(), ::highlight()) have no computed style",
  );
  defineWPT("css/cssom/getComputedStyle-pseudo-shadow.html");
  defineWPT(
    "css/cssom/getComputedStyle-pseudo-with-argument.html",
    "pseudo-elements other than ::before/::after (::checkmark, ::picker-icon, ::picker(), ::highlight()) have no computed style",
  );
  defineWPT("css/cssom/getComputedStyle-resolved-min-max-clamping.html");
  defineWPT(
    "css/cssom/getComputedStyle-resolved-min-size-auto.html",
    "needs layout (no layout engine, docs/deviations.md)",
  );
  defineWPT("css/cssom/getComputedStyle-root-variables.html");
  defineWPT("css/cssom/getComputedStyle-root.html");
  defineWPT("css/cssom/getComputedStyle-shadow-host.html");
  defineWPT("css/cssom/getComputedStyle-shadow-inherit.html");
  defineWPT("css/cssom/getComputedStyle-style-element-updates.html");
  defineWPT("css/cssom/getComputedStyle-visibility-nominal-case.html");
  defineWPT("css/cssom/getComputedStyle-visibility-override.html");
  defineWPT("css/cssom/getComputedStyle-visibility-unset.html");
  defineWPT("css/cssom/grouping-rule-no-nested-declarations.html");
  defineWPT("css/cssom/historical.html");
  defineWPT("css/cssom/import-namespace-invalid-prelude.html");
  defineWPT("css/cssom/inline-style-001.html");
  defineWPT("css/cssom/insertRule-font-face.html");
  defineWPT("css/cssom/insertRule-namespace-after-import.html");
  defineWPT("css/cssom/invalid-pseudo-elements.html");
  defineWPT("css/cssom/link-element-stylesheet-title.html");
  defineWPT("css/cssom/medialist-appendmedium-parse-single-and-dedup.html");
  defineWPT("css/cssom/medialist-deletemedium-parse-and-remove-all.html");
  defineWPT("css/cssom/medialist-interfaces-002.html");
  defineWPT("css/cssom/medialist-interfaces-004.html");
  defineWPT("css/cssom/mediaquery-sort-dedup.html");
  defineWPT("css/cssom/nested-import-namespace-invalid.html");
  defineWPT("css/cssom/preferred-stylesheet-reversed-order.html");
  defineWPT("css/cssom/property-accessors.html");
  defineWPT("css/cssom/resolved-border-width.html");
  defineWPT(
    "css/cssom/selectorSerialize.html",
    "escaped characters in namespace prefixes are not supported by the selector parser",
  );
  defineWPT("css/cssom/selectorText-modification-restyle-002.html");
  defineWPT("css/cssom/serialization-CSSDeclaration-with-important.html");
  defineWPT(
    "css/cssom/serialize-all-longhands.html",
    "computed serialization of some rarely used longhands' initial values differs from browsers",
  );
  defineWPT(
    "css/cssom/serialize-custom-props.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT(
    "css/cssom/serialize-media-rule.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT("css/cssom/serialize-namespaced-type-selectors.html");
  defineWPT(
    "css/cssom/serialize-values.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT("css/cssom/serialize-variable-reference.html");
  defineWPT("css/cssom/serialize-whitespace.html");
  defineWPT("css/cssom/set-selector-text-attachment.html");
  defineWPT("css/cssom/setproperty-custom-property-override-important.html");
  defineWPT("css/cssom/setproperty-null-undefined.html");
  defineWPT("css/cssom/shadow-dom-style-sheet.html");
  defineWPT("css/cssom/shorthand-serialization.html");
  defineWPT(
    "css/cssom/shorthand-values.html",
    "overflow/outline/list-style longhands are not recombined into the shorthand in cssText (stored unexpanded, docs/deviations.md); line-clamp alias",
  );
  defineWPT("css/cssom/style-attr-update-across-documents.html");
  defineWPT("css/cssom/style-background-position-longhands.html");
  defineWPT(
    "css/cssom/style-background-position.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT(
    "css/cssom/style-background-repeat.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT(
    "css/cssom/style-background-shorthand-overwrite.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT("css/cssom/style-backgroundcolor-table-row.html");
  defineWPT("css/cssom/style-backgroundimage-lineargradient.html");
  defineWPT("css/cssom/style-color-values.html");
  defineWPT(
    "css/cssom/style-color.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT("css/cssom/style-cssText-mutations.html");
  defineWPT("css/cssom/style-element-inline-important.html");
  defineWPT("css/cssom/style-element-insertion-removal-computed.html");
  defineWPT("css/cssom/style-font-shorthand.html");
  defineWPT("css/cssom/style-global-variable.html");
  defineWPT(
    "css/cssom/style-set-cssText.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT("css/cssom/style-set-custom-property-priority.html");
  defineWPT("css/cssom/style-set-custom-property.html");
  defineWPT(
    "css/cssom/style-set-property.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT("css/cssom/style-sheet-interfaces-001.html", "@import / <link> style sheets are not fetched (no network)");
  defineWPT("css/cssom/style-sheet-interfaces-002.html");
  defineWPT("css/cssom/stylesheet-title.html", "alternate / preferred style sheet sets are not implemented");
  defineWPT("css/cssom/system-color-inherit.html");
  defineWPT(
    "css/cssom/system-color-lowercase.html",
    "jsdom-compatible specified-value serialization edge case (author text kept closer to as written)",
  );
  defineWPT("css/cssom/ttwf-cssom-doc-ext-load-tree-order.html");
  defineWPT("css/cssom/ttwf-cssom-document-extension.html");
  defineWPT(
    "css/cssom/variable-names.html",
    "custom property names that need escaping do not round-trip through cssText",
  );
});

describe("CSSOM View: MediaQueryList, screen, scrolling arguments (https://drafts.csswg.org/cssom-view/)", () => {
  defineWPT("css/cssom-view/background-change-during-smooth-scroll.html");
  defineWPT("css/cssom-view/cssom-view-window-screen-interface.html");
  defineWPT("css/cssom-view/parsing/scroll-behavior-computed.html");
  defineWPT("css/cssom-view/parsing/scroll-behavior-invalid.html");
  defineWPT("css/cssom-view/parsing/scroll-behavior-valid.html");
  defineWPT("css/cssom-view/screenLeftTop.html");
  defineWPT("css/cssom-view/scroll-back-to-initial-position.html");
  defineWPT("css/cssom-view/scroll-offsets-fractional-zoom.html");
  defineWPT("css/cssom-view/scroll-overflow-clip-quirks-002.html");
  defineWPT("css/cssom-view/scroll-position-root-child-ib-split-insertion.html");
  defineWPT("css/cssom-view/scrollIntoView-horizontal-tb-writing-mode-and-rtl-direction.html");
  defineWPT("css/cssom-view/scrollIntoView-horizontal-tb-writing-mode.html");
  defineWPT("css/cssom-view/scrollIntoView-inline-image.html");
  defineWPT("css/cssom-view/scrollIntoView-nearest-visible-element.html");
  defineWPT("css/cssom-view/scrollIntoView-sideways-lr-writing-mode-and-rtl-direction.html");
  defineWPT("css/cssom-view/scrollIntoView-sideways-lr-writing-mode.html");
  defineWPT("css/cssom-view/scrollIntoView-sideways-rl-writing-mode-and-rtl-direction.html");
  defineWPT("css/cssom-view/scrollIntoView-sideways-rl-writing-mode.html");
  defineWPT("css/cssom-view/scrollIntoView-vertical-lr-writing-mode-and-rtl-direction.html");
  defineWPT("css/cssom-view/scrollIntoView-vertical-lr-writing-mode.html");
  defineWPT("css/cssom-view/scrollIntoView-vertical-rl-writing-mode.html");
  defineWPT("css/cssom-view/scrollLeftTop.html");
  defineWPT("css/cssom-view/scrollWidthHeight-contain-layout.html");
  defineWPT("css/cssom-view/scrollWidthHeight-not-scrollable-fractional-zoom.html");
  defineWPT("css/cssom-view/scrollWidthHeight-overflow-visible-margin-collapsing.html");
  defineWPT("css/cssom-view/scrollWidthHeight-overflow-visible-negative-margins.html");
  defineWPT("css/cssom-view/window-screen-height-immutable.html");
  defineWPT("css/cssom-view/window-screen-height.html");
  defineWPT("css/cssom-view/window-screen-width-immutable.html");
  defineWPT("css/cssom-view/window-screen-width.html");
});
