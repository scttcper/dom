/**
 * WPT accname manual tests, run differentially.
 *
 * Spec: Accessible Name and Description Computation
 *   https://w3c.github.io/accname/#computation-steps
 *   https://w3c.github.io/accname/#mapping_additional_nd_description
 *
 * Fixtures: web-platform-tests `accname/*-manual.html` (BSD-3-Clause) at the commit
 * dom-accessibility-api pins as its `tests/wpt` submodule
 * (5203cae896dc55f9835769137af5208b5a2f2bad), extracted by scripts/extract-wpt-accname.cjs
 * into test/wpt/accname.json. Original harness:
 * https://github.com/eps1lon/dom-accessibility-api/tree/main/tests/wpt-jsdom
 *
 * For every case @ctrl/dom/aria on @ctrl/dom must produce exactly what dom-accessibility-api
 * 0.5.16 produces on jsdom (the observable behavior Testing Library users rely on). Whether
 * that matches the WPT expectation is reported separately: upstream itself fails some cases
 * (see tests/wpt-jsdom/to-run.yaml upstream), so it is informational only.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createWindow, type Element } from "@ctrl/dom";
import { computeAccessibleDescription, computeAccessibleName } from "@ctrl/dom/aria";
import { loadOracle } from "./helpers.ts";
import { AUTHOR_STYLES_SUPPORTED } from "../src/style.ts";

interface Case {
  file: string;
  kind: "name" | "description";
  html: string;
  element: string;
  expected: string;
}

const cases: Case[] = JSON.parse(readFileSync(new URL("./wpt/accname.json", import.meta.url), "utf8"));
const O = loadOracle();

/* eslint-disable @typescript-eslint/no-explicit-any */
function upstream(c: Case): string {
  const dom = new O.JSDOM(`<!doctype html><html><head></head><body>${c.html}</body></html>`);
  const el = dom.window.document.getElementById(c.element);
  return c.kind === "name" ? O.daa05.computeAccessibleName(el) : O.daa05.computeAccessibleDescription(el);
}

function ours(c: Case): string {
  const doc = createWindow().document;
  doc.body!.innerHTML = c.html;
  const el = doc.getElementById(c.element) as Element;
  return c.kind === "name" ? computeAccessibleName(el) : computeAccessibleDescription(el);
}

const specResults = new Map<string, boolean>();

describe("WPT accname — https://w3c.github.io/accname/#computation-steps", () => {
  for (const c of cases) {
    // Author <style> sheets that hide content need the css fast API (pending, see src/style.ts).
    const needsAuthorStyles = /<style[\s\S]*?(display|visibility)[\s\S]*?<\/style>/.test(c.html);
    test.skipIf(needsAuthorStyles && !AUTHOR_STYLES_SUPPORTED)(`${c.file}: ${c.kind} equals dom-accessibility-api@0.5.16 on jsdom`, () => {
      const expected = upstream(c);
      const actual = ours(c);
      specResults.set(c.file, actual === c.expected);
      expect(actual).toBe(expected);
    });
  }

  test("spec conformance is reported (informational, mirrors upstream's own WPT failures)", () => {
    const failing = [...specResults].filter(([, ok]) => !ok).map(([f]) => f);
    // Not asserted against a fixed list: upstream's failures are the oracle's, not ours.
    expect(specResults.size).toBeGreaterThan(0);
    console.info(`WPT accname: ${specResults.size - failing.length}/${specResults.size} match the spec expectation`);
  });
});
