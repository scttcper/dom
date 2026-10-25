// ResizeObserver delivery for layout-lite (docs/layout.md).
// https://drafts.csswg.org/resize-observer/
//
// Only documents of `layout: "lite"` windows get observations; elsewhere ResizeObserver stays the
// callback-less stub of window/observers.ts. There is no rendering loop, so "gather active
// observations" + "broadcast" (https://drafts.csswg.org/resize-observer/#broadcast-active-resize-observations)
// run in a microtask after:
//   - observe() (every new observation starts at lastReportedSizes [(-1,-1)], so it always
//     fires once: https://drafts.csswg.org/resize-observer/#dom-resizeobservation-resizeobservation),
//   - each layout-lite recomputation (the first geometry read after a DOM/style change) of a
//     document with observations.
// Observer depth ordering and the loop error are simplified: a run delivers every active
// observation, and after 32 consecutive delivering runs the chain stops until the next observe().

import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import { type ResizeObserver, resizeObserverHooks } from "../window/observers.ts";
import { DOMRectReadOnly } from "../window/geometry.ts";
import { reportException } from "../events/report.ts";
import { $callback, $devicePixelRatio, $impl, $window } from "../keys.ts";
import { boxOf, layoutOn, setRelayoutListener } from "./layout.ts";
import { layoutEnabled } from "./layout-mode.ts";
import type { Window } from "../window/Window.ts";

/** https://drafts.csswg.org/resize-observer/#resizeobserversize */
export class ResizeObserverSize {
  readonly inlineSize: number;
  readonly blockSize: number;
  constructor(inlineSize: number, blockSize: number) {
    this.inlineSize = inlineSize;
    this.blockSize = blockSize;
  }
  get [Symbol.toStringTag](): string {
    return "ResizeObserverSize";
  }
}

/** https://drafts.csswg.org/resize-observer/#resize-observer-entry-interface */
export class ResizeObserverEntry {
  readonly target: Element;
  readonly contentRect: DOMRectReadOnly;
  readonly borderBoxSize: readonly ResizeObserverSize[];
  readonly contentBoxSize: readonly ResizeObserverSize[];
  readonly devicePixelContentBoxSize: readonly ResizeObserverSize[];
  constructor(target: Element, border: ResizeObserverSize, content: ResizeObserverSize, device: ResizeObserverSize, paddingLeft: number, paddingTop: number) {
    this.target = target;
    // https://drafts.csswg.org/resize-observer/#create-and-populate-resizeobserverentry steps 6-8
    this.contentRect = new DOMRectReadOnly(paddingLeft, paddingTop, content.inlineSize, content.blockSize);
    this.borderBoxSize = Object.freeze([border]);
    this.contentBoxSize = Object.freeze([content]);
    this.devicePixelContentBoxSize = Object.freeze([device]);
  }
  get [Symbol.toStringTag](): string {
    return "ResizeObserverEntry";
  }
}

/** https://drafts.csswg.org/resize-observer/#resizeobservation */
class Observation {
  target: Element;
  box: string;
  lastInline: number;
  lastBlock: number;
  constructor(target: Element, box: string) {
    this.target = target;
    this.box = box;
    this.lastInline = -1;
    this.lastBlock = -1;
  }
}

const observations = new WeakMap<ResizeObserver, Map<Element, Observation>>();
/** Observers with observations per document (weak: a closed window's document takes them along). */
const byDocument = new WeakMap<Document, Set<ResizeObserver>>();
const pending = new Set<Document>();
let scheduled = false;
let chain = 0;
const enqueue = globalThis.queueMicrotask.bind(globalThis);

function schedule(doc: Document): void {
  pending.add(doc);
  if (scheduled) return;
  scheduled = true;
  enqueue(runChecks);
}

function observe(observer: ResizeObserver, target: Element, box: string): void {
  if (!layoutEnabled) return;
  const impl = target[$impl];
  if (impl === undefined) return;
  const doc = impl.doc;
  if (!layoutOn(doc)) return;
  let map = observations.get(observer);
  if (map === undefined) observations.set(observer, (map = new Map()));
  // https://drafts.csswg.org/resize-observer/#dom-resizeobserver-observe steps 3-5: replace.
  map.delete(target);
  map.set(target, new Observation(target, box));
  let set = byDocument.get(doc);
  if (set === undefined) byDocument.set(doc, (set = new Set()));
  set.add(observer);
  chain = 0;
  schedule(doc);
}

function unobserve(observer: ResizeObserver, target: Element): void {
  observations.get(observer)?.delete(target);
}

function disconnect(observer: ResizeObserver): void {
  observations.get(observer)?.clear();
}

let curInline = 0;
let curBlock = 0;

/** https://drafts.csswg.org/resize-observer/#calculate-box-size */
function boxSize(target: Element, box: string): void {
  const b = boxOf(target[$impl]);
  if (b === null) {
    curInline = curBlock = 0;
    return;
  }
  if (box === "border-box") {
    curInline = b.w;
    curBlock = b.h;
    return;
  }
  curInline = Math.max(0, b.w - b.bl - b.br - b.pl - b.pr);
  curBlock = Math.max(0, b.h - b.bt - b.bb - b.pt - b.pb);
  if (box === "device-pixel-content-box") {
    const dpr = (target[$impl].doc[$window] as Window)[$devicePixelRatio];
    curInline = Math.round(curInline * dpr);
    curBlock = Math.round(curBlock * dpr);
  }
}

function entryFor(o: Observation): ResizeObserverEntry {
  const target = o.target;
  boxSize(target, "border-box");
  const border = new ResizeObserverSize(curInline, curBlock);
  boxSize(target, "content-box");
  const content = new ResizeObserverSize(curInline, curBlock);
  boxSize(target, "device-pixel-content-box");
  const device = new ResizeObserverSize(curInline, curBlock);
  const b = boxOf(target[$impl]);
  return new ResizeObserverEntry(target, border, content, device, b === null ? 0 : b.pl, b === null ? 0 : b.pt);
}

function runChecks(): void {
  scheduled = false;
  const docs = [...pending];
  pending.clear();
  let delivered = false;
  for (const doc of docs) {
    const set = byDocument.get(doc);
    if (set === undefined) continue;
    for (const observer of Array.from(set)) {
      const map = observations.get(observer);
      if (map === undefined || map.size === 0) {
        set.delete(observer);
        continue;
      }
      // https://drafts.csswg.org/resize-observer/#gather-active-observations-h (isActive())
      const entries: ResizeObserverEntry[] = [];
      for (const o of map.values()) {
        boxSize(o.target, o.box);
        if (curInline === o.lastInline && curBlock === o.lastBlock) continue;
        o.lastInline = curInline;
        o.lastBlock = curBlock;
        entries.push(entryFor(o));
      }
      if (entries.length === 0) continue;
      delivered = true;
      try {
        observer[$callback].call(observer, entries, observer);
      } catch (error) {
        reportException(error, entries[0].target);
      }
    }
  }
  // Layout changed by the callbacks is re-checked by the relayout listener; bound the chain.
  if (delivered) chain++;
  else chain = 0;
}

resizeObserverHooks.observe = observe;
resizeObserverHooks.unobserve = unobserve;
resizeObserverHooks.disconnect = disconnect;
setRelayoutListener((doc) => {
  if (chain < 32 && byDocument.has(doc)) schedule(doc);
});
