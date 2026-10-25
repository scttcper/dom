/**
 * html5lib tokenizer conformance tests.
 *
 * Spec: HTML Standard §13.2.5 "Tokenization"
 *   https://html.spec.whatwg.org/#tokenization
 *   https://html.spec.whatwg.org/#character-references (§13.2.5.77–84)
 *   https://html.spec.whatwg.org/#character-reference-state (entities, namedEntities and
 *   numericEntities.test)
 *   https://html.spec.whatwg.org/#named-character-references (§13.5)
 *
 * Runs the vendored html5lib-tests tokenizer suite (fixtures/html5lib/tokenizer, MIT) against
 * src/parser/tokenizer.ts. Format: https://github.com/html5lib/html5lib-tests/tree/master/tokenizer
 * Parse errors are not compared (the tokenizer does not report them); adjacent character
 * tokens are merged as the format requires. The suite runs with the (opt-in) processing
 * instruction states enabled, since the vendored tests track the current standard.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  S_CDATA_SECTION,
  S_DATA,
  S_PLAINTEXT,
  S_RAWTEXT,
  S_RCDATA,
  S_SCRIPT_DATA,
  TK_CHARS,
  TK_COMMENT,
  TK_DOCTYPE,
  TK_END,
  TK_EOF,
  TK_PI,
  TK_START,
  Tokenizer,
} from "../../src/parser/tokenizer.ts";

const dir = new URL("./fixtures/html5lib/tokenizer/", import.meta.url);

interface TokenizerTest {
  description: string;
  input: string;
  output: unknown[][];
  initialStates?: string[];
  lastStartTag?: string;
  doubleEscaped?: boolean;
}

const STATES: Record<string, number> = {
  "Data state": S_DATA,
  "PLAINTEXT state": S_PLAINTEXT,
  "RCDATA state": S_RCDATA,
  "RAWTEXT state": S_RAWTEXT,
  "Script data state": S_SCRIPT_DATA,
  "CDATA section state": S_CDATA_SECTION,
};

/** Known failures: "file :: description :: state" → reason. */
const SKIP = new Map<string, string>([]);

function unescape(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function deepUnescape(v: unknown): unknown {
  if (typeof v === "string") return unescape(v);
  if (Array.isArray(v)) return v.map(deepUnescape);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[unescape(k)] = deepUnescape(val);
    return out;
  }
  return v;
}

function tokenize(input: string, state: number, lastStartTag: string | undefined, pis: boolean): unknown[][] {
  const tok = new Tokenizer();
  tok.reset(input);
  tok.state = state;
  tok.processingInstructions = pis;
  // The CDATA section initial state is only reachable in foreign content.
  tok.allowCDATA = state === S_CDATA_SECTION;
  if (lastStartTag !== undefined) tok.lastStartTag = lastStartTag;
  const out: unknown[][] = [];
  for (;;) {
    const t = tok.next();
    if (t === TK_EOF) break;
    switch (t) {
      case TK_CHARS: {
        const last = out[out.length - 1];
        if (last !== undefined && last[0] === "Character") last[1] += tok.text;
        else out.push(["Character", tok.text]);
        break;
      }
      case TK_START: {
        const attrs: Record<string, string> = {};
        for (let i = 0; i < tok.attrCount; i++) attrs[tok.attrNames[i]] = tok.attrValues[i];
        out.push(tok.selfClosing ? ["StartTag", tok.name, attrs, true] : ["StartTag", tok.name, attrs]);
        break;
      }
      case TK_END:
        out.push(["EndTag", tok.name]);
        break;
      case TK_COMMENT:
        out.push(["Comment", tok.data]);
        break;
      case TK_PI:
        out.push(["ProcessingInstruction", tok.name, tok.data]);
        break;
      case TK_DOCTYPE:
        out.push([
          "DOCTYPE",
          tok.hasName ? tok.name : null,
          tok.hasPublicId ? tok.publicId : null,
          tok.hasSystemId ? tok.systemId : null,
          !tok.forceQuirks,
        ]);
        break;
    }
  }
  return out;
}

/** html5lib output may split character tokens; merge them like our tokenizer does. */
function mergeCharacters(tokens: unknown[][]): unknown[][] {
  const out: unknown[][] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (t[0] === "Character" && last !== undefined && last[0] === "Character") last[1] = String(last[1]) + String(t[1]);
    else out.push([...t]);
  }
  return out;
}

let total = 0;
let skipped = 0;

for (const file of readdirSync(dir)
  .filter((f) => f.endsWith(".test"))
  .sort()) {
  // xmlViolation.test describes an XML-infoset coercion mode we do not implement.
  if (file === "xmlViolation.test") continue;
  const json = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as {
    tests?: TokenizerTest[];
    xmlViolationTests?: TokenizerTest[];
  };
  const tests = json.tests ?? [];
  describe(`html5lib tokenizer ${file} — https://html.spec.whatwg.org/#tokenization`, () => {
    for (const raw of tests) {
      const t = raw.doubleEscaped ? (deepUnescape(raw) as TokenizerTest) : raw;
      // The vendored suite tracks the 2026 spec, where "<?" starts a processing instruction.
      const pis = true;
      for (const stateName of t.initialStates ?? ["Data state"]) {
        const key = `${file} :: ${raw.description} :: ${stateName}`;
        total++;
        const reason = SKIP.get(key);
        if (reason !== undefined) skipped++;
        (reason !== undefined ? test.skip : test)(`${raw.description} (${stateName})`, () => {
          const actual = tokenize(t.input, STATES[stateName], t.lastStartTag, pis);
          expect(actual).toEqual(mergeCharacters(t.output));
        });
      }
    }
  });
}

test("html5lib tokenizer suite size", () => {
  expect(total).toBeGreaterThan(6000);
  void skipped;
});
