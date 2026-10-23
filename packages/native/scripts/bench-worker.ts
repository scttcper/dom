// One native-vs-JS sample in a fresh process (spawned by scripts/bench.ts).
//
//   node scripts/bench-worker.ts <js|native> <op> <warm|cold>
//
// cold: time of the FIRST call in this process (no JIT warmup; for native, addon load is
// reported separately and also included in `coldWithLoadMs`). warm: median of timed
// iterations after warmup. Prints `@@RESULT <json>`.

import { createRequire } from "node:module";
import { inputs } from "./bench-inputs.ts";

const [impl, op, mode] = process.argv.slice(2);

interface Op {
  /** One timed unit of work against `lib`; returns a value that is checked across impls. */
  run(lib: any): unknown;
  iterations: number;
}

function decodeTokenStream(s: string): number {
  // Realistic consumer of the native token stream: split back into records/fields and fold the
  // same checksum the JS pull tokenizer computes over its fields.
  let h = 0;
  let count = 0;
  const recs = s.length ? s.split("\u0001") : [];
  for (let r = 0; r < recs.length; r++) {
    const f = recs[r].split("\u0002");
    count++;
    h = (Math.imul(h, 31) + f.length) | 0;
  }
  return count * 65536 + (h & 0xffff);
}

const ops: Record<string, Op> = {
  noop: {
    iterations: 20,
    run(lib) {
      let s = 0;
      for (let i = 0; i < 1_000_000; i++) s = lib.noop(s);
      return s;
    },
  },
  "html-large": { iterations: 15, run: (lib) => lib.htmlChecksum(inputs.htmlLarge) },
  "html-fragment-x200": {
    iterations: 20,
    run(lib) {
      let s = 0;
      for (let i = 0; i < 200; i++) s += lib.htmlChecksum(inputs.htmlFragment);
      return s;
    },
  },
  "html-tokens-large": {
    iterations: 15,
    // JS: the pull tokenizer consumed in place. Native: serialized stream decoded by JS.
    run: (lib) => (impl === "native" ? decodeTokenStream(lib.htmlTokens(inputs.htmlLarge)) : lib.htmlTokenCount(inputs.htmlLarge)),
  },
  "css-large": { iterations: 15, run: (lib) => lib.cssChecksum(inputs.cssLarge) },
  "css-inline-x10k": {
    iterations: 20,
    run(lib) {
      let s = 0;
      for (let i = 0; i < 10_000; i++) s += lib.cssChecksum(inputs.inlineStyles[i % inputs.inlineStyles.length]);
      return s;
    },
  },
  "selector-x10k": {
    iterations: 20,
    run(lib) {
      let s = 0;
      for (let i = 0; i < 10_000; i++) s += lib.selectorChecksum(inputs.selectors[i % inputs.selectors.length]);
      return s;
    },
  },
  "selector-batch-10k": { iterations: 20, run: (lib) => lib.selectorBatchChecksum(inputs.selectorBatch) },
  "entities-attr-x100k": {
    iterations: 20,
    run(lib) {
      let s = 0;
      for (let i = 0; i < 100_000; i++) s += lib.decodeEntities(inputs.attrValues[i % inputs.attrValues.length]).length;
      return s;
    },
  },
  "entities-text-1mb": { iterations: 15, run: (lib) => lib.decodeEntities(inputs.entityText).length },
};

const o = ops[op];
if (!o) throw new Error(`unknown op ${op}`);

const tLoad0 = performance.now();
let lib: any;
if (impl === "native") {
  const require = createRequire(import.meta.url);
  // Node-API properties are non-enumerable: use the addon object itself, not a spread copy.
  lib = require("../dist/rtd-native.node");
} else {
  const m = await import("../src/lib/rtd.ts");
  const { Tokenizer, TK_EOF } = await import("../../dom/src/parser/tokenizer.ts");
  const tok = new Tokenizer();
  // Count records/fields exactly like decodeTokenStream, straight off the pull tokenizer.
  const htmlTokenCount = (src: string) => {
    tok.reset(src);
    let h = 0;
    let count = 0;
    for (let t = tok.next(); t !== TK_EOF; t = tok.next()) {
      count++;
      const fields = t === 2 ? 2 + tok.attrCount * 2 : t === 1 || t === 3 || t === 4 || t === 5 ? 2 : 1;
      h = (Math.imul(h, 31) + fields) | 0;
    }
    tok.release();
    return count * 65536 + (h & 0xffff);
  };
  lib = { ...m, htmlTokenCount };
}
const loadMs = performance.now() - tLoad0;

const collect = impl === "native" ? () => lib.collect() : () => {};
let result: unknown;
let ms: number;
const extra: Record<string, number> = { loadMs };
if (mode === "cold") {
  const t0 = performance.now();
  result = o.run(lib);
  collect();
  ms = performance.now() - t0;
  extra.coldWithLoadMs = ms + loadMs;
} else {
  const times: number[] = [];
  for (let i = 0; i < 5 + o.iterations; i++) {
    const t0 = performance.now();
    result = o.run(lib);
    collect();
    const dt = performance.now() - t0;
    if (i >= 5) times.push(dt);
  }
  times.sort((a, b) => a - b);
  ms = times[times.length >> 1];
}
const mu = process.memoryUsage();
process.stdout.write(
  `@@RESULT ${JSON.stringify({ impl, op, mode, ms, result, rssMB: mu.rss / 2 ** 20, heapMB: mu.heapUsed / 2 ** 20, ...extra })}\n`,
);
