/**
 * html5lib tree-construction conformance tests.
 *
 * Spec: HTML Standard §13.2.6 "Tree construction" and §13.4 "Parsing HTML fragments"
 *   https://html.spec.whatwg.org/#tree-construction
 *   https://html.spec.whatwg.org/#html-fragment-parsing-algorithm
 *
 * Runs the vendored html5lib-tests tree-construction suite (fixtures/html5lib/tree-construction,
 * MIT) through `parseDocument` / `parseFragment` into real NodeImpl trees and compares the
 * html5lib tree dump. Format:
 * https://github.com/html5lib/html5lib-tests/blob/master/tree-construction/README.md
 * Tests marked #script-on run with the scripting flag set; all others with it off (our default,
 * like jsdom). Parse errors are not compared. Known failures are listed in SKIP with reasons.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createWindow } from "../../src/index.ts";
import { Document } from "../../src/nodes/Document.ts";
import type { NodeImpl } from "../../src/nodes/NodeImpl.ts";
import { parseDocument, parseFragment } from "../../src/parser/index.ts";
import { HTML_NS, MATHML_NS, SVG_NS, XLINK_NS, XML_NS, XMLNS_NS } from "../../src/nodes/constants.ts";
import { $impl } from "../../src/keys.ts";

createWindow();

const dir = new URL("./fixtures/html5lib/tree-construction/", import.meta.url);

interface TreeTest {
  data: string;
  fragment: string | null;
  scripting: boolean | null;
  document: string;
  line: number;
}

/** Known failures: "file:line" → reason. (Empty: the selectedcontent cases pass now that html-forms mirrors the selected option.) */
export const SKIP = new Map<string, string>([]);

function parseDat(text: string): TreeTest[] {
  const lines = text.split("\n");
  const tests: TreeTest[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i] !== "#data") {
      i++;
      continue;
    }
    const line = i + 1;
    i++;
    const data: string[] = [];
    while (i < lines.length && !lines[i].startsWith("#errors")) data.push(lines[i++]);
    let fragment: string | null = null;
    let scripting: boolean | null = null;
    const doc: string[] = [];
    while (i < lines.length && lines[i] !== "#document") {
      if (lines[i] === "#document-fragment") fragment = lines[++i];
      else if (lines[i] === "#script-on") scripting = true;
      else if (lines[i] === "#script-off") scripting = false;
      i++;
    }
    i++; // #document
    while (i < lines.length && lines[i] !== "#data") doc.push(lines[i++]);
    while (doc.length !== 0 && doc[doc.length - 1] === "") doc.pop();
    tests.push({ data: data.join("\n"), fragment, scripting, document: doc.join("\n"), line });
  }
  return tests;
}

function attrDisplayName(ns: string | null, prefix: string | null, local: string): string {
  if (ns === XLINK_NS) return "xlink " + local;
  if (ns === XML_NS) return "xml " + local;
  if (ns === XMLNS_NS) return "xmlns " + local;
  return prefix === null ? local : prefix + ":" + local;
}

function dump(parent: NodeImpl, depth: number, out: string[]): void {
  for (let n = parent.first; n !== null; n = n.next) {
    const indent = "| " + "  ".repeat(depth);
    switch (n.type) {
      case 1: {
        const prefix = n.ns === SVG_NS ? "svg " : n.ns === MATHML_NS ? "math " : n.ns === HTML_NS ? "" : (n.ns ?? "") + " ";
        out.push(`${indent}<${prefix}${n.name}>`);
        const attrs = (n.attrs ?? []).map((a) => [attrDisplayName(a.ns, a.prefix, a.localName), a.value] as const);
        attrs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        for (const [name, value] of attrs) out.push(`${indent}  ${name}="${value}"`);
        if (n.ns === HTML_NS && n.name === "template") {
          const content = (n.node as unknown as { content?: { [$impl]: NodeImpl } }).content;
          out.push(`${indent}  content`);
          if (content !== undefined) dump(content[$impl], depth + 2, out);
        }
        dump(n, depth + 1, out);
        break;
      }
      case 3:
        out.push(`${indent}"${n.data}"`);
        break;
      case 8:
        out.push(`${indent}<!-- ${n.data} -->`);
        break;
      case 7:
        out.push(`${indent}<?${n.name} ${n.data}>`);
        break;
      case 10: {
        const dt = n.node as unknown as { publicId: string; systemId: string };
        if (dt.publicId !== "" || dt.systemId !== "") out.push(`${indent}<!DOCTYPE ${n.name} "${dt.publicId}" "${dt.systemId}">`);
        else out.push(`${indent}<!DOCTYPE ${n.name}>`);
        break;
      }
    }
  }
}

export function runTreeTest(t: TreeTest): string {
  const scripting = t.scripting === true;
  const doc = Document._createHTML(null);
  if (t.fragment === null) {
    parseDocument(t.data, doc, { scripting });
    const out: string[] = [];
    dump(doc[$impl], 0, out);
    return out.join("\n");
  }
  const [a, b] = t.fragment.split(" ");
  const context =
    b === undefined
      ? doc.createElement(a)
      : doc.createElementNS(a === "svg" ? SVG_NS : a === "math" ? MATHML_NS : HTML_NS, b);
  const fragment = parseFragment(t.data, context[$impl], { scripting });
  const out: string[] = [];
  dump(fragment, 0, out);
  return out.join("\n");
}

let total = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".dat")).sort()) {
  const tests = parseDat(readFileSync(new URL(file, dir), "utf8"));
  describe(`html5lib tree-construction ${file} — https://html.spec.whatwg.org/#tree-construction`, () => {
    for (const t of tests) {
      const key = `${file}:${t.line}`;
      total++;
      const reason = SKIP.get(key);
      const name = `${key} ${JSON.stringify(t.data).slice(0, 80)}${t.fragment !== null ? ` [fragment: ${t.fragment}]` : ""}${t.scripting === true ? " [script-on]" : ""}`;
      (reason !== undefined ? test.skip : test)(name, () => {
        expect(runTreeTest(t)).toBe(t.document);
      });
    }
  });
}

test("html5lib tree-construction suite size", () => {
  expect(total).toBeGreaterThan(1500);
});
