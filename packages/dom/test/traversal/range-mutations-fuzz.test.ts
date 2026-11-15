/**
 * Live ranges under random tree and text mutations, compared with jsdom.
 *
 * Specs:
 *   DOM live ranges — https://dom.spec.whatwg.org/#concept-live-range
 *   insert step 2 — https://dom.spec.whatwg.org/#concept-node-insert
 *   remove steps 4-7 — https://dom.spec.whatwg.org/#concept-node-remove
 *   replace data steps 8-11 — https://dom.spec.whatwg.org/#concept-cd-replace
 *   split a Text node steps 7.2-7.5 — https://dom.spec.whatwg.org/#concept-text-split
 *   normalize() step 6 — https://dom.spec.whatwg.org/#dom-node-normalize
 *   Selection — https://w3c.github.io/selection-api/#selection-interface
 *
 * The mutation algorithms skip the range steps for nodes without range marks (F_RANGE /
 * F_RANGE_BELOW in nodes/constants.ts). A missed mark leaves a boundary point stale, which only
 * shows after particular mutation sequences, so this replays seeded random sequences on both
 * implementations and compares every range and the selection after each step.
 */
import { describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow } from "@ctrl/dom";

/** mulberry32: a seeded PRNG whose every output bit is usable (an LCG's low bits cycle). */
function mulberry32(seed: number): (n: number) => number {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n) | 0;
  };
}

const MARKUP =
  "<div><p>aaaa<b>bbbb</b>cccc</p><p>dddd<i>eeee</i></p><ul><li>1111</li><li>2222</li><li>3333</li></ul></div><section><span>xxxx</span>yyyy</section>";

type Op = [kind: number, a: number, b: number, c: number];

function ops(seed: number, count: number): Op[] {
  const rnd = mulberry32(seed);
  const out: Op[] = [];
  for (let i = 0; i < count; i++) out.push([rnd(13), rnd(1000), rnd(1000), rnd(7)]);
  return out;
}

/** Runs `ops` and returns one line per step: every range and the selection, as node indices. */
function replay(win: any, steps: Op[]): string[] {
  const d = win.document;
  const root = d.createElement("div");
  root.innerHTML = MARKUP;
  d.body.replaceChildren(root);
  win.getSelection().removeAllRanges();
  const nodes: any[] = [];
  const walk = (n: any): void => {
    nodes.push(n);
    for (const c of n.childNodes) walk(c);
  };
  walk(root);
  const len = (n: any): number => (n.nodeType === 3 ? n.data.length : n.childNodes.length);
  const ranges: any[] = [];
  const log: string[] = [];
  for (const [op, a, b, c] of steps) {
    const x = nodes[a % nodes.length];
    const y = nodes[b % nodes.length];
    let line = "";
    try {
      switch (op) {
        case 0: {
          const r = d.createRange();
          r.setStart(x, Math.min(c, len(x)));
          ranges.push(r);
          break;
        }
        case 1:
          if (ranges.length !== 0) ranges[c % ranges.length].setEnd(y, Math.min(c % 5, len(y)));
          break;
        case 2:
          if (x !== root) x.remove();
          break;
        case 3:
          y.insertBefore(x, y.childNodes[c % (y.childNodes.length + 1)] ?? null);
          break;
        case 4:
          if (x.nodeType === 3) x.data = "zz" + c;
          break;
        case 5:
          if (x.nodeType === 3 && x.data.length > 1) nodes.push(x.splitText(1));
          break;
        case 6:
          if (x.nodeType === 3) x.deleteData(1, 2);
          break;
        case 7: {
          const f = d.createDocumentFragment();
          f.append(x, y);
          nodes[(a + b) % nodes.length].appendChild(f);
          break;
        }
        case 8:
          // Not normalize(): jsdom's only moves ranges that reference the merged node itself
          // (it skips steps 6.3-6.4); see the normalize test below.
          if (x.nodeType === 3) x.insertData(Math.min(c, x.data.length), "ins");
          break;
        case 9:
          if (x.nodeType === 1) x.textContent = "t" + c;
          break;
        case 10:
          if (ranges.length !== 0) ranges[c % ranges.length].selectNodeContents(x);
          break;
        case 11:
          win.getSelection().setBaseAndExtent(x, 0, y, 0);
          break;
        case 12:
          if (ranges.length !== 0) ranges[c % ranges.length].insertNode(d.createTextNode("n" + c));
          break;
      }
    } catch (e: any) {
      line = `${e.name} `;
    }
    const sel = win.getSelection();
    const at = (n: any): number => nodes.indexOf(n);
    line += ranges
      .map((r) => `${at(r.startContainer)}:${r.startOffset}-${at(r.endContainer)}:${r.endOffset}`)
      .join(",");
    line += ` | ${at(sel.anchorNode)}:${sel.anchorOffset}-${at(sel.focusNode)}:${sel.focusOffset}`;
    log.push(line);
  }
  return log;
}

describe("live ranges under mutation — https://dom.spec.whatwg.org/#concept-live-range", () => {
  test("boundary points and the selection match jsdom after every step of 100 random 120-step sequences", () => {
    const ours = createWindow();
    const jsdom = new JSDOM("<!doctype html><body></body>").window;
    for (let seed = 1; seed <= 100; seed++) {
      const steps = ops(seed, 120);
      const a = replay(ours, steps);
      const b = replay(jsdom, steps);
      const i = a.findIndex((line, k) => line !== b[k]);
      if (i !== -1)
        expect({ seed, step: i, op: steps[i], ours: a[i] }).toEqual({ seed, step: i, op: steps[i], ours: b[i] });
    }
    ours.close();
    jsdom.close();
  }, 30_000);
});

describe("remove steps 4-7 after the boundary's subtree was inserted — https://dom.spec.whatwg.org/#concept-node-remove", () => {
  // remove() skips the range steps unless the removed node has F_RANGE_BELOW, which insertion
  // must carry up to a boundary's new ancestors (nodes/tree.ts link()). A boundary only travels
  // with its subtree when that subtree was detached (moving a connected node, or inserting a
  // fragment's children, removes them first, which moves the boundary out to the old parent).
  // Each way of inserting one:
  const inserts: [string, (d: any, node: any, into: any) => void][] = [
    ["appendChild", (_d, node, into) => into.appendChild(node)],
    ["insertBefore", (_d, node, into) => into.insertBefore(node, into.firstChild)],
    ["replaceChildren", (_d, node, into) => into.replaceChildren(node)],
  ];
  for (const [how, insert] of inserts) {
    test(`a range set in a detached subtree inserted by ${how} follows the removal of its new ancestor`, () => {
      const w = createWindow();
      const d = w.document as any;
      d.body.innerHTML = "<section><div id=b></div></section>";
      const b = d.getElementById("b");
      const section = b.parentNode;
      const span = d.createElement("span");
      span.innerHTML = "<i>hello</i>";
      const r = d.createRange();
      r.setStart(span.firstChild.firstChild, 2);
      insert(d, span, b);
      expect([r.startContainer, r.startOffset]).toEqual([span.firstChild.firstChild, 2]);
      section.removeChild(b);
      expect([r.startContainer, r.startOffset]).toEqual([section, 0]);
      w.close();
    });
  }
});

describe("normalize() — https://dom.spec.whatwg.org/#dom-node-normalize", () => {
  test("step 6: ranges in or between the merged Text nodes move into the first one", () => {
    const w = createWindow();
    const d = w.document;
    const p = d.createElement("p");
    d.body!.append(p);
    p.append("ab", "cd", "ef");
    const inMerged = d.createRange();
    inMerged.setStart(p.childNodes[1]!, 1);
    // Step 6.3: start node is currentNode's parent and start offset is currentNode's index.
    const between = d.createRange();
    between.setStart(p, 2);
    // A selection elsewhere must not stop either from moving.
    d.getSelection()!.collapse(d.body, 0);
    p.normalize();
    const text = p.firstChild!;
    expect(p.childNodes.length).toBe(1);
    expect([inMerged.startContainer, inMerged.startOffset]).toEqual([text, 3]);
    expect([between.startContainer, between.startOffset]).toEqual([text, 4]);
    w.close();
  });
});
