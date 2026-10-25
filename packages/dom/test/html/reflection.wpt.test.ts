/**
 * IDL attribute reflection, driven by the WPT reflection suite.
 *
 * Spec: HTML Standard §2.6.1 "Reflecting content attributes in IDL attributes"
 *   https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes
 * plus the per-element IDL attribute tables of every section the element data files cover
 * (metadata, sections, grouping, text-level, edits, embedded, tabular, misc, obsolete).
 *
 * Ported from web-platform-tests html/dom/reflection-*.html
 *   https://github.com/web-platform-tests/wpt/tree/master/html/dom
 * The harness files (original-harness.js, new-harness.js, reflection.js, elements-*.js) are
 * vendored unmodified in ./wpt/reflection (WPT is BSD-3-Clause; copied from WPT at
 * 89adb92b23d5b0dd9bf8263181783bfde74b2f6d). Form elements (elements-forms*.js) belong to the
 * html-forms tests; ARIA reflection (elements-aria-enumerated.js) to the core ARIAMixin tests.
 *
 * The suite emits ~30k testharness subtests; they are grouped into one vitest test per
 * "<element>.<attribute>" so failures read as e.g. `img.width: IDL set to 4294967295`.
 * Known failures are listed in KNOWN_FAILURES with the reason.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

const DIR = new URL("./wpt/reflection/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, DIR), "utf8");

/** Subtest-name prefixes (or exact names) that are expected to fail, with the reason. */
const KNOWN_FAILURES: Record<string, string> = {};

type Subtest = { name: string; error: string | null };

function sameValue(a: unknown, b: unknown): boolean {
  return Object.is(a, b);
}

function repr(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (Object.is(v, -0)) return "-0";
  return String(v);
}

function runSuite(elementsFile: string): Map<string, Subtest[]> {
  const window = createWindow({ url: "http://localhost/html/dom/reflection.html" });
  const document = window.document as any;
  const groups = new Map<string, Subtest[]>();
  const testShim = (fn: () => void, name: string) => {
    let error: string | null = null;
    try {
      fn();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const colon = name.indexOf(": ");
    const key = colon === -1 ? name : name.slice(0, colon);
    let list = groups.get(key);
    if (list === undefined) groups.set(key, (list = []));
    list.push({ name, error });
  };
  const assert_equals = (actual: unknown, expected: unknown, desc?: string) => {
    if (!sameValue(actual, expected)) throw new Error(`expected ${repr(expected)} but got ${repr(actual)}${desc ? ` (${desc})` : ""}`);
  };
  const assert_in_array = (actual: unknown, expected: unknown[]) => {
    if (!expected.some((e) => sameValue(actual, e))) throw new Error(`${repr(actual)} not in [${expected.map(repr).join(", ")}]`);
  };
  const assert_throws_dom = (type: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if ((e as DOMException).name !== type) throw new Error(`expected ${type} but got ${(e as Error).name}`);
      return;
    }
    throw new Error(`expected ${type} to be thrown`);
  };
  const body = [read("original-harness.js"), read("new-harness.js"), read(elementsFile), read("reflection.js")].join("\n;\n");
  const run = new Function("window", "document", "test", "assert_equals", "assert_in_array", "assert_throws_dom", "DOMException", body);
  // The harness reads JS builtins off `window` (window.String, ...), as on a browser global.
  const win = new Proxy(window, { get: (t, k) => (k in t ? (t as any)[k] : (globalThis as any)[k]) });
  run(win, document, testShim, assert_equals, assert_in_array, assert_throws_dom, DOMException);
  return groups;
}

for (const file of [
  "elements-metadata.js",
  "elements-sections.js",
  "elements-grouping.js",
  "elements-text.js",
  "elements-embedded.js",
  "elements-tabular.js",
  "elements-misc.js",
  "elements-obsolete.js",
]) {
  describe(`reflection (${file}) — https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes`, () => {
    const groups = runSuite(file);
    for (const [key, subtests] of groups) {
      test(`${key} reflects its content attribute`, () => {
        const failures = subtests
          .filter((s) => s.error !== null)
          .filter((s) => !Object.keys(KNOWN_FAILURES).some((k) => s.name === k || s.name.startsWith(k)))
          .map((s) => `${s.name} — ${s.error}`);
        expect(failures).toEqual([]);
      });
    }
  });
}
