// WPT survey (not part of the suite): runs every testharness test under WPT_DIRS and writes
// per-file and per-directory pass counts. Point WPT_ROOT at an upstream checkout to survey
// files that are not vendored yet:
//
//   WPT_SURVEY=1 WPT_ROOT=~/wpt WPT_DIRS=dom/events,html/semantics/forms \
//     WPT_OUT=/tmp/survey.txt pnpm vitest run --config test/wpt/vitest.survey.config.ts
//
// WPT_FILTER / WPT_EXCLUDE (regexps on the path), WPT_VERBOSE=1 (failure messages),
// WPT_JSON=<file> (failing subtest names per file, the expectations.json format).
import { test } from "vitest";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runWPT, FIXTURES, JS_TEST, jsTestRunsInWindow } from "./harness.ts";

const SKIP_DIRS = new Set(["support", "resources", "reference", "references", "crashtests", "tools"]);

/** testharness.js tests under `dir` (recursively), relative to FIXTURES. */
function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(FIXTURES, dir)).sort()) {
    const rel = `${dir}/${name}`;
    if (statSync(join(FIXTURES, rel)).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...testFiles(rel));
      continue;
    }
    if (/-ref\.html?$|-manual\.|-iframe\.html$|\.sub\.|\.https\.|\.tentative\.|-crash\.html$/.test(name)) continue;
    const source = readFileSync(join(FIXTURES, rel), "utf8");
    if (JS_TEST.test(name) ? jsTestRunsInWindow(source) : /\.html?$/.test(name) && source.includes("/resources/testharness.js")) out.push(rel);
  }
  return out;
}

test.skipIf(!process.env.WPT_SURVEY)("survey", async () => {
  const dirs = (process.env.WPT_DIRS ?? "dom/ranges,dom/traversal,dom/collections,dom/nodes").split(",");
  const filter = process.env.WPT_FILTER ? new RegExp(process.env.WPT_FILTER) : null;
  const exclude = process.env.WPT_EXCLUDE ? new RegExp(process.env.WPT_EXCLUDE) : null;
  const lines: string[] = [];
  const json: Record<string, string[]> = {};
  const perDir = new Map<string, { files: number; pass: number; total: number; crashed: number }>();
  for (const d of dirs) {
    for (const file of testFiles(d)) {
      if (filter && !filter.test(file)) continue;
      if (exclude && exclude.test(file)) continue;
      const key = file.slice(0, file.lastIndexOf("/"));
      const agg = perDir.get(key) ?? { files: 0, pass: 0, total: 0, crashed: 0 };
      perDir.set(key, agg);
      agg.files++;
      const t0 = performance.now();
      let res;
      try {
        res = await runWPT(file, { timeout: Number(process.env.WPT_TIMEOUT ?? 1000) });
      } catch (e) {
        agg.crashed++;
        lines.push(`${file}: CRASH ${String(e).slice(0, 200)}`);
        continue;
      }
      const pass = res.filter((r) => r.status === "PASS").length;
      agg.pass += pass;
      agg.total += res.length;
      lines.push(`${file}: ${pass}/${res.length} ${Math.round(performance.now() - t0)}ms`);
      if (process.env.WPT_VERBOSE) for (const r of res) if (r.status !== "PASS") lines.push(`   ${r.status} ${r.name} :: ${r.message.slice(0, 300).replace(/\n/g, " ")}`);
      if (process.env.WPT_JSON) json[file] = res.filter((r) => r.status !== "PASS").map((r) => r.name);
    }
  }
  const summary = [...perDir].map(([dir, a]) => `${dir.padEnd(64)} ${String(a.files).padStart(4)} files  ${a.pass}/${a.total} subtests${a.crashed ? `  ${a.crashed} crashed` : ""}`);
  if (process.env.WPT_JSON) writeFileSync(process.env.WPT_JSON, JSON.stringify(json, null, 1));
  writeFileSync(process.env.WPT_OUT ?? "survey.txt", [...summary, "", ...lines].join("\n"));
}, 3_600_000);
