// Scratch (not part of the suite): run the WPT accessibility dirs with the @ctrl/dom/aria
// testdriver, and for every get_computed_role/get_computed_label call also compute what stock
// Testing Library (jsdom + aria-query + dom-accessibility-api@0.5.16) returns for the same
// element (serialized document re-parsed in jsdom). Writes a JSON report to TRIAGE_OUT.
import { test } from "vitest";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Element } from "@ctrl/dom";
import { computeAccessibleName } from "@ctrl/dom/aria";
import { runWPT, FIXTURES, JS_TEST, jsTestRunsInWindow } from "../../dom/test/wpt/harness.ts";
import { wptComputedRole, wptRoleName } from "./wpt-testdriver.ts";
import { loadOracle } from "./helpers.ts";

const SKIP_DIRS = new Set(["support", "resources", "reference", "references", "crashtests", "tools", "manual"]);
function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(FIXTURES, dir)).sort()) {
    const rel = `${dir}/${name}`;
    if (statSync(join(FIXTURES, rel)).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...testFiles(rel));
      continue;
    }
    if (/-ref\.html?$|-manual\.|-iframe\.html$|\.sub\.|\.https\.|-crash\.html$/.test(name)) continue;
    const source = readFileSync(join(FIXTURES, rel), "utf8");
    if (JS_TEST.test(name) ? jsTestRunsInWindow(source) : /\.html?$/.test(name) && source.includes("/resources/testharness.js")) out.push(rel);
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const O = loadOracle();

function stock(el: any, kind: "role" | "label"): string {
  const doc = el.ownerDocument;
  if (el.getRootNode() !== doc) return "<shadow>";
  const all = Array.from(doc.querySelectorAll("*"));
  const idx = all.indexOf(el);
  const dom = new O.JSDOM(doc.documentElement.outerHTML);
  const j = dom.window.document.querySelectorAll("*")[idx];
  if (!j) return "<missing>";
  if (kind === "label") return O.daa05.computeAccessibleName(j);
  const r = j.getAttribute("role");
  const role = r !== null ? r.split(" ")[0] : (O.roleHelpers.getImplicitAriaRoles(j)[0] ?? "");
  return wptRoleName(role);
}

test.skipIf(!process.env.TRIAGE_OUT)("triage", async () => {
  const dirs = (process.env.WPT_DIRS ?? "wai-aria,accname,html-aam").split(",");
  const report: any[] = [];
  for (const d of dirs) {
    for (const file of testFiles(d)) {
      const calls: any[] = [];
      const td = () => ({
        get_computed_role: async (el: Element) => {
          const ours = wptComputedRole(el);
          calls.push({ kind: "role", html: el.outerHTML, ours, stock: stock(el, "role") });
          return ours;
        },
        get_computed_label: async (el: Element) => {
          const ours = computeAccessibleName(el);
          calls.push({ kind: "label", html: el.outerHTML, ours, stock: stock(el, "label") });
          return ours;
        },
      });
      let results;
      try {
        results = await runWPT(file, { testdriver: td });
      } catch (e) {
        report.push({ file, crash: String(e) });
        continue;
      }
      report.push({ file, results, calls });
    }
  }
  writeFileSync(process.env.TRIAGE_OUT!, JSON.stringify(report, null, 1));
}, 3_600_000);
