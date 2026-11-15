/**
 * Property value parsing and specified-value serialization — web-platform-tests
 * css/<module>/parsing/*-valid.html and *-invalid.html, run unmodified through
 * test/wpt/harness.ts (vendored at web-platform-tests/wpt@049a18c under test/wpt/fixtures/<same
 * path>; known failures in test/wpt/expectations/css.json).
 *
 * These pin the serializations where @ctrl/dom follows the spec instead of jsdom 30 (and where
 * jsdom 31 does too): docs/deviations.md "CSS values".
 *
 * Specs:
 *   CSSOM serialize a CSS value — https://drafts.csswg.org/cssom/#serialize-a-css-value
 *   CSS Backgrounds box-shadow — https://drafts.csswg.org/css-backgrounds-3/#box-shadow
 *   CSS Images <gradient> — https://drafts.csswg.org/css-images-4/#gradients
 *   CSS Transitions shorthand — https://drafts.csswg.org/css-transitions-2/#transition-shorthand-property
 *   CSS UI outline — https://drafts.csswg.org/css-ui-4/#outline
 *   CSS Fonts font-family — https://drafts.csswg.org/css-fonts-4/#font-family-prop
 *   CSS Color opacity — https://drafts.csswg.org/css-color-4/#transparency
 *   CSS Color 5 color-mix() — https://drafts.csswg.org/css-color-5/#color-mix
 *
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/css (3-clause BSD).
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

const CALC = "math functions are kept as written, not simplified (calc(25% * 2) stays, not calc(50%))";

describe("CSS property parsing (https://drafts.csswg.org/cssom/#serialize-a-css-value)", () => {
  defineWPT("css/css-backgrounds/parsing/box-shadow-valid.html");
  defineWPT("css/css-backgrounds/parsing/box-shadow-invalid.html", `${CALC}; calc() lengths are not type-checked`);
  defineWPT(
    "css/css-backgrounds/parsing/background-image-valid.html",
    "gradient positions and sizes are not reordered or simplified (to top left, circle 10px), cross-fade() and light-dark() images are kept as written or rejected",
  );
  defineWPT(
    "css/css-backgrounds/parsing/background-image-invalid.html",
    "gradient and cross-fade() arguments are not fully validated",
  );
  defineWPT("css/css-transitions/parsing/transition-valid.html");
  defineWPT("css/css-transitions/parsing/transition-invalid.html");
  defineWPT("css/css-ui/parsing/outline-valid.html");
  defineWPT("css/css-ui/parsing/outline-invalid.html");
  defineWPT("css/css-ui/parsing/outline-color-valid.html");
  defineWPT("css/css-ui/parsing/outline-color-invalid.html");
  defineWPT("css/css-fonts/parsing/font-family-valid.html");
  defineWPT("css/css-fonts/parsing/font-family-invalid.html");
  defineWPT("css/css-color/parsing/opacity-valid.html", CALC);
  defineWPT("css/css-color/parsing/opacity-invalid.html");
  defineWPT(
    "css/css-color/parsing/color-valid-color-mix-function.html",
    `${CALC}; legacy colors with \`none\` components (hsl(none …)) serialize as rgb()`,
  );
  defineWPT("css/css-color/parsing/color-invalid-color-mix-function.html");
});
