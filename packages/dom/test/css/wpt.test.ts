/**
 * Web Platform Tests: CSSOM.
 *
 * Specs:
 *   CSSOM — https://drafts.csswg.org/cssom/
 *     §6.1 CSSStyleSheet https://drafts.csswg.org/cssom/#the-cssstylesheet-interface
 *     §6.4 CSS rules https://drafts.csswg.org/cssom/#css-rules
 *     §6.6 CSSStyleDeclaration https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface
 *     §6.7 the CSS namespace (escape) https://drafts.csswg.org/cssom/#the-css-namespace
 *     §9 getComputedStyle https://drafts.csswg.org/cssom/#extensions-to-the-window-interface
 *
 * The .html files in ./wpt are unmodified copies from web-platform-tests/wpt@5203cae
 * (https://github.com/web-platform-tests/wpt/tree/master/css/cssom, 3-clause BSD), run through
 * a small testharness.js stand-in (./wpt-harness.ts). Every subtest becomes a vitest test;
 * subtests that fail for documented reasons are listed in EXPECTED_FAILURES with the reason
 * and asserted to still fail (so fixes show up).
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { runWPT, type SubtestResult } from "./wpt-harness.ts";

const dir = new URL("./wpt/", import.meta.url);

/** file → subtest name → reason. */
const DETACHED = "jsdom-compatible: detached elements still get computed values (docs/deviations.md)";
const NO_IFRAMES = "iframes have no content documents here";
const EXPECTED_FAILURES: Record<string, Record<string, string>> = {
  "CSSStyleSheet-constructable.html": {
    "(harness: script error)": NO_IFRAMES,
    "Re-attaching shadow host with adopted stylesheets work": DETACHED,
    "Stylesheets constructed on the main Document cannot be used in iframes": NO_IFRAMES,
    "Stylesheet constructed on iframe cannot be used in the main Document": NO_IFRAMES,
  },
  "cssstyledeclaration-csstext.html": {
    "Shorthands aren't serialized if there are other properties with different logical groups in between":
      "logical shorthands (margin-inline/block) are stored unexpanded",
    "Shorthands _are_ serialized if there are no other properties with different logical groups in between":
      "logical shorthands (margin-inline/block) are stored unexpanded",
  },
  "cssstyledeclaration-mutability.html": {
    "getComputedStyle's CSSStyleDeclaration is not mutable":
      "jsdom-compatible: named setters on computed declarations are ignored instead of throwing (setProperty does throw)",
  },
  "flex-serialization.html": {
    "Single value flex with non-CSS-wide value should serialize correctly.":
      "jsdom-compatible: `flex: 0` serializes as `0 1 0%`",
  },
  "getComputedStyle-detached-subtree.html": {
    "getComputedStyle returns no style for detached element": DETACHED,
    "getComputedStyle returns no style for element in non-rendered iframe (display: none)": DETACHED,
    "getComputedStyle returns no style for element in non-rendered iframe (display: none) from iframe's window":
      DETACHED,
    "(harness: script error)": NO_IFRAMES,
  },
  "getComputedStyle-display-none-001.html": {
    "getComputedStyle gets invalidated in display: none subtrees due to inherited changes to an ancestor":
      "no named access on window (docs/deviations.md): `undisplayed` element id global",
    "getComputedStyle gets invalidated in display: none subtrees due to inherited changes to an ancestor shadow host":
      "no named access on window (docs/deviations.md): `host` element id global",
  },
  "getComputedStyle-pseudo.html": {
    "Resolution of width is correct for ::before and ::after pseudo-elements":
      "no layout: percentages are not resolved to used px values",
    "Resolution of width is correct for ::before and ::after pseudo-elements of display: contents elements":
      "no layout: percentages are not resolved to used px values",
  },
  "getComputedStyle-resolved-colors.html": {
    "The resolved value for 'box-shadow' is the used value":
      "box-shadow colors are not resolved (value kept as specified)",
  },
};

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".html"))
  .sort();

const results = new Map<string, SubtestResult[]>();
for (const f of files) results.set(f, await runWPT(readFileSync(new URL(f, dir), "utf8")));

for (const f of files) {
  describe(`WPT css/cssom/${f} — https://github.com/web-platform-tests/wpt/blob/master/css/cssom/${f}`, () => {
    const subtests = results.get(f)!;
    test("file produced subtests", () => {
      expect(subtests.length).toBeGreaterThan(0);
    });
    const seen = new Map<string, number>();
    for (const r of subtests) {
      const n = (seen.get(r.name) ?? 0) + 1;
      seen.set(r.name, n);
      const name = n === 1 ? r.name : `${r.name} (#${n})`;
      const reason = EXPECTED_FAILURES[f]?.[r.name];
      if (reason !== undefined) {
        test(`[expected failure: ${reason}] ${name}`, () => {
          expect(r.status).toBe("fail");
        });
      } else {
        test(name, () => {
          if (r.status === "fail") throw new Error(r.message);
        });
      }
    }
  });
}
