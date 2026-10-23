// Core DOM hot-path microbenchmark: @rtd/dom vs jsdom vs happy-dom.
//
//   node packages/dom/test/perf/core-bench.ts            # driver: fresh process per sample
//   node packages/dom/test/perf/core-bench.ts rtd        # one sample for one implementation
//
// Each sample runs in a fresh process; the driver reports the median and min–max of 5 samples
// per workload, plus heap-after-GC and RSS at the end of a sample. Not a vitest test (*.ts,
// not *.test.ts), so it never runs as part of the suite.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type Doc = {
  createElement(n: string): El;
  createTextNode(t: string): El;
  body: El;
};
type El = {
  appendChild(n: El): El;
  insertBefore(n: El, r: El | null): El;
  removeChild(n: El): El;
  setAttribute(n: string, v: string): void;
  getAttribute(n: string): string | null;
  firstChild: El | null;
  nextSibling: El | null;
  parentNode: El | null;
  childNodes: ArrayLike<El>;
  textContent: string | null;
};

async function makeDocument(impl: string): Promise<Doc> {
  if (impl === "rtd") {
    const { createWindow } = await import("../../src/index.ts");
    return createWindow().document as unknown as Doc;
  }
  if (impl === "jsdom") {
    const { JSDOM } = await import("jsdom");
    return new JSDOM("<!doctype html><html><head></head><body></body></html>").window.document as unknown as Doc;
  }
  const { Window } = await import("happy-dom");
  const w = new Window();
  return w.document as unknown as Doc;
}

const workloads: Record<string, (doc: Doc) => number> = {
  // createElement + setAttribute + appendChild (text child) — React's commit phase shape.
  "build 10k elements": (doc) => {
    const root = doc.createElement("div");
    for (let i = 0; i < 10000; i++) {
      const el = doc.createElement(i % 2 ? "span" : "div");
      el.setAttribute("class", "item");
      el.setAttribute("data-i", String(i));
      el.appendChild(doc.createTextNode("x"));
      root.appendChild(el);
    }
    doc.body.appendChild(root);
    return 10000;
  },
  "insertBefore first x5k": (doc) => {
    const root = doc.body.appendChild(doc.createElement("div"));
    for (let i = 0; i < 5000; i++) root.insertBefore(doc.createElement("i"), root.firstChild);
    return 5000;
  },
  "removeChild x10k": (doc) => {
    const root = doc.body.appendChild(doc.createElement("div"));
    for (let i = 0; i < 10000; i++) root.appendChild(doc.createElement("i"));
    let c: El | null;
    while ((c = root.firstChild) !== null) root.removeChild(c);
    return 10000;
  },
  "get/setAttribute x1M": (doc) => {
    const el = doc.createElement("div");
    el.setAttribute("id", "a");
    el.setAttribute("class", "b");
    el.setAttribute("role", "button");
    let n = 0;
    for (let i = 0; i < 500000; i++) {
      el.setAttribute("aria-label", i & 1 ? "x" : "y");
      if (el.getAttribute("role") !== null) n++;
    }
    return n;
  },
  "firstChild/nextSibling walk 10k x50": (doc) => {
    const root = buildTree(doc);
    let n = 0;
    for (let r = 0; r < 50; r++) {
      const stack: El[] = [root];
      while (stack.length) {
        const node = stack.pop()!;
        for (let c = node.firstChild; c !== null; c = c.nextSibling) {
          n++;
          stack.push(c);
        }
      }
    }
    return n;
  },
  "childNodes[i] loop 10k x50": (doc) => {
    const root = buildTree(doc);
    let n = 0;
    for (let r = 0; r < 50; r++) {
      const kids = root.childNodes;
      for (let i = 0; i < kids.length; i++) if (kids[i].parentNode === root) n++;
    }
    return n;
  },
  "textContent read 10k x50": (doc) => {
    const root = buildTree(doc);
    let n = 0;
    for (let r = 0; r < 50; r++) n += root.textContent!.length;
    return n;
  },
};

function buildTree(doc: Doc): El {
  const root = doc.body.appendChild(doc.createElement("section"));
  for (let i = 0; i < 1000; i++) {
    const row = root.appendChild(doc.createElement("div"));
    for (let j = 0; j < 4; j++) {
      const cell = row.appendChild(doc.createElement("span"));
      cell.appendChild(doc.createTextNode("cell"));
    }
  }
  return root;
}

async function sample(impl: string): Promise<void> {
  const out: Record<string, number> = {};
  for (const [name, fn] of Object.entries(workloads)) {
    const doc = await makeDocument(impl);
    fn(await makeDocument(impl)); // warm-up on a separate document
    const t = performance.now();
    fn(doc);
    out[name] = performance.now() - t;
  }
  (globalThis as { gc?: () => void }).gc?.();
  out["heap MB"] = process.memoryUsage().heapUsed / 1048576;
  out["rss MB"] = process.memoryUsage().rss / 1048576;
  process.stdout.write(JSON.stringify(out));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

const arg = process.argv[2];
if (arg !== undefined) {
  await sample(arg);
} else {
  const file = fileURLToPath(import.meta.url);
  const impls = ["rtd", "happy-dom", "jsdom"];
  const results: Record<string, Record<string, number[]>> = {};
  for (let s = 0; s < 5; s++) {
    for (const impl of impls) {
      const json = JSON.parse(execFileSync(process.execPath, ["--expose-gc", file, impl], { encoding: "utf8" })) as Record<string, number>;
      for (const [k, v] of Object.entries(json)) ((results[k] ??= {})[impl] ??= []).push(v);
    }
  }
  const rows = Object.entries(results).map(([k, byImpl]) => {
    const row: Record<string, string> = { workload: k };
    for (const impl of impls) {
      const xs = byImpl[impl];
      row[impl] = `${median(xs).toFixed(1)} (${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)})`;
    }
    row["jsdom / rtd"] = (median(byImpl.jsdom) / median(byImpl.rtd)).toFixed(1) + "x";
    row["happy / rtd"] = (median(byImpl["happy-dom"]) / median(byImpl.rtd)).toFixed(1) + "x";
    return row;
  });
  console.table(rows);
}
