/**
 * The default text normalizer (packages/testing-library/src/matches.ts `getDefaultNormalizer`)
 * returns its input unchanged when trimming and collapsing whitespace would not change it, and
 * otherwise matches upstream exactly.
 *
 * Upstream: https://github.com/testing-library/dom-testing-library/blob/main/src/matches.ts
 * (`text.trim()`, `text.replace(/\s+/g, ' ')`); `\s` and `String.prototype.trim` share one
 * character set: https://tc39.es/ecma262/#sec-compiletocharset,
 * https://tc39.es/ecma262/#sec-string.prototype.trim
 */
import { describe, expect, test } from "vitest";
import { getDefaultNormalizer } from "../../src/index.ts";

function upstream(text: string, trim: boolean, collapseWhitespace: boolean): string {
  let normalizedText = text;
  normalizedText = trim ? normalizedText.trim() : normalizedText;
  normalizedText = collapseWhitespace ? normalizedText.replace(/\s+/g, " ") : normalizedText;
  return normalizedText;
}

const SAMPLES = [
  "",
  " ",
  "  ",
  "a",
  "Row 12 label",
  " leading",
  "trailing ",
  "two  spaces",
  "tab\there",
  "new\nline",
  " nbsp",
  "nbsp inside",
  "ideographic　space",
  "zero﻿width",
  "line separator",
  " \t mixed \n runs   ",
  "x\r\ny",
];

describe("getDefaultNormalizer — fast path returns the input when nothing changes", () => {
  for (const trim of [true, false]) {
    for (const collapseWhitespace of [true, false]) {
      test(`trim=${trim} collapseWhitespace=${collapseWhitespace}: same result as upstream's two passes`, () => {
        const normalize = getDefaultNormalizer({ trim, collapseWhitespace });
        for (const s of SAMPLES) expect(normalize(s), JSON.stringify(s)).toBe(upstream(s, trim, collapseWhitespace));
      });
    }
  }
});
