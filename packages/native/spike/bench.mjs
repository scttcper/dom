import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const t0 = performance.now();
const nat = require("./spike.node");
const loadMs = performance.now() - t0;
const js = await import("./lib.ts");

function run(name, api) {
  api.reset();
  const N = 200_000;
  let t = performance.now();
  let s = 0;
  for (let i = 0; i < 2_000_000; i++) s += api.noop(i);
  const noopNs = ((performance.now() - t) * 1e6) / 2_000_000;
  t = performance.now();
  const root = api.createElement("div");
  for (let i = 0; i < N; i++) {
    const el = api.createElement(i % 3 === 0 ? "button" : "span");
    api.setAttribute(el, "class", "item-" + (i & 15));
    api.setAttribute(el, "data-testid", "t");
    api.appendChild(root, el);
  }
  const buildMs = performance.now() - t;
  t = performance.now();
  let g = 0;
  for (let i = 1; i < N; i++) g += api.getAttribute(i, "class").length;
  const getMs = performance.now() - t;
  t = performance.now();
  let c = 0;
  for (let k = 0; k < 20; k++) c += api.countByTag(root, "button");
  const countMs = performance.now() - t;
  console.log(`${name}: noop ${noopNs.toFixed(1)}ns/call  build ${N} nodes ${buildMs.toFixed(1)}ms  getAttr ${getMs.toFixed(1)}ms  countByTag x20 ${countMs.toFixed(1)}ms  (${s > 0}, ${g}, ${c})`);
}
console.log("addon load ms", loadMs.toFixed(2));
for (let i = 0; i < 3; i++) { run("native", nat); run("js    ", js); }
