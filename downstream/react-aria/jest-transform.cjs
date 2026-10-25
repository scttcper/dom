// Jest transformer for the react-aria downstream runner's `ctrl-dom-full` mode: upstream's own
// @swc/jest transform (same options, resolved from the checkout), plus one source rewrite applied
// ONLY to our built bundles (`packages/*/dist/**`):
//
//   <name> = await import("<literal>");   ->   <name> = require("<literal>");
//
// Upstream's Jest runs CommonJS; @swc/jest turns our ESM bundles into CommonJS, but it cannot turn
// a module-level `await` into CommonJS, and @ctrl/dom/user-event's bundle has one
// (`internal = await import("@ctrl/dom/internal")`, src/ctrl-dom.ts). Without the rewrite every test
// that imports user-event fails to load with a SyntaxError. This is a known blocker filed in
// TRIAGE.md (cluster "user-event: top-level await") with a repro; the receipts count the rewrites
// so the report shows whether it is still needed. Upstream files are never rewritten.
"use strict";
const { appendFileSync } = require("node:fs");

const TLA = /^(\s*[\w$]+\s*=\s*)await import\(("[^"]+")\);$/gm;

module.exports = {
  createTransformer({ swc, checkout, repo }) {
    const swcJest = require(require.resolve("@swc/jest", { paths: [checkout] }));
    const inner = swcJest.createTransformer(swc);
    const dist = `${repo}/packages/`;
    const rewrite = (source, file, log = false) => {
      if (!file.startsWith(dist) || !file.includes("/dist/")) return source;
      let n = 0;
      const out = source.replace(TLA, (_, lhs, spec) => {
        n++;
        return `${lhs}require(${spec});`;
      });
      if (n && log && process.env.CTRL_DOM_RA_TRANSFORMS) {
        appendFileSync(
          process.env.CTRL_DOM_RA_TRANSFORMS,
          JSON.stringify({ file: file.slice(repo.length + 1), rewrites: n }) + "\n",
        );
      }
      return out;
    };
    return {
      canInstrument: inner.canInstrument,
      process: (source, file, options) => inner.process(rewrite(source, file), file, options),
      processAsync:
        inner.processAsync && ((source, file, options) => inner.processAsync(rewrite(source, file), file, options)),
      // getCacheKey runs for every load (cache hit or miss), so it records the receipt.
      getCacheKey: (source, file, options) =>
        `${inner.getCacheKey(rewrite(source, file, true), file, options)}:ctrl-dom-tla-1`,
    };
  },
};
