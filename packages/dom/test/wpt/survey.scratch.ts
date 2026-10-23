import { test } from "vitest";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runWPT, FIXTURES } from "./harness.ts";
test.skipIf(!process.env.WPT_SURVEY)("survey", async () => {
  const dirs = (process.env.WPT_DIRS ?? "dom/ranges,dom/traversal,dom/collections,dom/nodes").split(",");
  const lines: string[] = [];
  const json: Record<string, string[]> = {};
  for (const d of dirs) {
    for (const f of readdirSync(join(FIXTURES, d)).filter((x) => /\.html?$/.test(x)).sort()) {
      if (process.env.WPT_FILTER && !f.includes(process.env.WPT_FILTER)) continue;
      if (process.env.WPT_EXCLUDE && new RegExp(process.env.WPT_EXCLUDE).test(f)) continue;
      let res; const t0 = performance.now();
      try { res = await runWPT(`${d}/${f}`, { timeout: 500 }); } catch (e) { lines.push(`${d}/${f}: CRASH ${e}`); continue; }
      const pass = res.filter((r) => r.status === "PASS").length;
      lines.push(`${d}/${f}: ${pass}/${res.length} ${Math.round(performance.now() - t0)}ms`);
      if (process.env.WPT_VERBOSE) for (const r of res) if (r.status !== "PASS") lines.push(`   ${r.status} ${r.name} :: ${r.message.slice(0, 300).replace(/\n/g, " ")}`);
      if (process.env.WPT_JSON) json[`${d}/${f}`] = res.filter((r) => r.status !== "PASS").map((r) => r.name);
    }
  }
  if (process.env.WPT_JSON) writeFileSync(process.env.WPT_JSON, JSON.stringify(json, null, 1));
  writeFileSync(process.env.WPT_OUT ?? "/private/tmp/claude-501/-Users-scooper-gh-react-testing-dom/bcb1cc30-7d81-4f72-9a63-e519bb03c49e/scratchpad/survey.txt", lines.join("\n"));
}, 600000);
