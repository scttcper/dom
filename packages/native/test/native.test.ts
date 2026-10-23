/**
 * Differential test: the scriptc-compiled addon (dist/rtd-native.node) must produce exactly what
 * the same TypeScript produces on V8, for every exported function of src/lib/rtd.ts.
 *
 * `scriptc coverage` (pnpm scriptc:check) only proves the modules compile; scriptc 0.4.2 also
 * accepts constructs it lowers to runtime throws (e.g. `eval`), so this is the check that the
 * compiled code actually behaves. Skipped when the addon has not been built
 * (`pnpm --filter @rtd/native build`).
 *
 * Specs exercised through the wrapped modules:
 * - https://html.spec.whatwg.org/#tokenization
 * - https://html.spec.whatwg.org/#character-reference-state
 * - https://drafts.csswg.org/css-syntax-3/#tokenization
 * - https://drafts.csswg.org/selectors-4/#grammar
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import * as js from "../src/lib/rtd.ts";
import { loadNative } from "../src/index.ts";
import { inputs } from "../scripts/bench-inputs.ts";

const addonPath = fileURLToPath(new URL("../dist/rtd-native.node", import.meta.url));
const native = existsSync(addonPath) ? loadNative() : null;

const htmlCases = [
  "",
  "plain text",
  "<!DOCTYPE html><html><head><title>T &amp; t</title></head><body><p class=a id='b' data-x=\"c\">Hi</p></body></html>",
  "<div><!-- comment --><br/><img src=x alt='a&lt;b'><textarea>&lt;raw</textarea><script>if (a < b) {}</script></div>",
  "<p>café \u{1F600} &eacute;&#233;&#xE9; &notin; &noti; &bogus;</p>",
  "<a href=/x?a=1&b=2>unterminated",
  "\r\n<p>\rCR\r\nLF</p>\u0000",
  inputs.htmlFragment,
];

const cssCases = ["", "a { color: red }", "@media (min-width: 1px) { .x::before { content: '\\201C' } }", "url(x.png) 12.5e3px -.5% #fff !important /* c */", inputs.inlineStyles.join(";")];

const selectorCases = [...inputs.selectors, "", ":not(", "a >", "[a=b i]", "div:has(> p:nth-child(2n+1 of .x))", "#é .\u{1F600}"];

const entityCases = [...inputs.attrValues, "&", "&;", "&#;", "&#x;", "&#0;", "&#x110000;", "&#128;", "&amp", "&ampx", "é&eacute;\u{1F600}"];

describe.skipIf(native === null)("rtd-native.node matches the JS build of src/lib/rtd.ts", () => {
  test("htmlChecksum: same checksum over the tokenizer's token stream", () => {
    for (const c of htmlCases) expect(native!.htmlChecksum(c), JSON.stringify(c.slice(0, 40))).toBe(js.htmlChecksum(c));
  });

  test("htmlTokens: same serialized token stream (UTF-8 round trip through the boundary)", () => {
    for (const c of htmlCases) expect(native!.htmlTokens(c)).toBe(js.htmlTokens(c));
  });

  test("cssChecksum: same CSS token types and token extents", () => {
    for (const c of cssCases) expect(native!.cssChecksum(c), c).toBe(js.cssChecksum(c));
  });

  test("selectorChecksum: same AST checksum, and -1 for the same invalid selectors", () => {
    for (const c of selectorCases) expect(native!.selectorChecksum(c), c).toBe(js.selectorChecksum(c));
    expect(native!.selectorBatchChecksum(inputs.selectors.join("\n"))).toBe(js.selectorBatchChecksum(inputs.selectors.join("\n")));
  });

  test("decodeEntities: same decoded text for named, numeric and malformed references", () => {
    for (const c of entityCases) expect(native!.decodeEntities(c), c).toBe(js.decodeEntities(c));
  });
});
