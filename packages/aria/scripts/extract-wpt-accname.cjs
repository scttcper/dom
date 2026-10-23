// Extracts the WPT accname manual tests (web-platform-tests/wpt `accname/`, BSD-3-Clause,
// at the commit dom-accessibility-api pins: 5203cae896dc55f9835769137af5208b5a2f2bad) into
// test/wpt/accname.json: { file, kind: "name" | "description", html, element, expected }.
// Usage: node packages/aria/scripts/extract-wpt-accname.cjs <wpt>/accname
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const dir = path.resolve(process.argv[2]);
const out = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
  const src = fs.readFileSync(path.join(dir, file), "utf8");
  const m = /new ATTAcomm\(\s*([\s\S]*?)\)\s*;/.exec(src);
  if (!m) continue;
  const spec = JSON.parse(m[1]);
  const step = spec.steps.find((s) => s.type === "test");
  const atk = step.test.ATK.find((a) => a[0] === "property" && (a[1] === "name" || a[1] === "description"));
  if (!atk) continue;
  const head = /<head>([\s\S]*?)<\/head>/i.exec(src)?.[1] ?? "";
  const styles = (head.match(/<style[\s\S]*?<\/style>/gi) ?? []).join("\n");
  let body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(src)[1];
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
  body = body.replace(/<div id="(manualMode|log|ATTAmessages)"><\/div>/g, "").trim();
  out.push({ file, kind: atk[1], html: styles + body, element: step.element, expected: atk[3] });
}
const target = path.join(__dirname, "../test/wpt/accname.json");
fs.writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
console.log("wrote", out.length, "cases to", target);
