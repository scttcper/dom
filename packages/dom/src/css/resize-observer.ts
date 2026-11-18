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
  constructor(
    target: Element,
    border: ResizeObserverSize,
    content: ResizeObserverSize,
    device: ResizeObserverSize,
    paddingLeft: number,
    paddingTop: number,
  ) {
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

// A live target keeps its observers callable. The reverse indexes are enumerable for
// delivery and disconnect, but neither the document nor the observer should root a target.
class ObservedTargets extends Set<Observation> {
  observer: WeakRef<ResizeObserver>;
  constructor(observer: ResizeObserver) {
    super();
    this.observer = new WeakRef(observer);
  }
}

/** https://drafts.csswg.org/resize-observer/#resizeobservation */
class Observation extends WeakRef<Element> {
  box: string;
  lastInline = -1;
  lastBlock = -1;
  targets: ObservedTargets;
  documentObservers: Map<ObservedTargets, number>;
  constructor(target: Element, box: string, targets: ObservedTargets, documentObservers: Map<ObservedTargets, number>) {
    super(target);
    this.box = box;
    this.targets = targets;
    this.documentObservers = documentObservers;
  }
}

const byTarget = new WeakMap<Element, Map<ResizeObserver, Observation>>();
const byObserver = new WeakMap<ResizeObserver, ObservedTargets>();
/** Number of targets each observer registered in this document. */
const byDocument = new WeakMap<Document, Map<ObservedTargets, number>>();
const collected = new FinalizationRegistry<Observation>(forgetObservation);
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
  const impl = target[$impl];
  if (impl === undefined) return;
  const doc = impl.doc;
  if (!layoutOn(doc)) return;
  // https://drafts.csswg.org/resize-observer/#dom-resizeobserver-observe steps 3-5: replace.
  let owners = byTarget.get(target);
  if (owners === undefined) byTarget.set(target, (owners = new Map()));
  let targets = byObserver.get(observer);
  if (targets === undefined) byObserver.set(observer, (targets = new ObservedTargets(observer)));
  let watchers = byDocument.get(doc);
  if (watchers === undefined) byDocument.set(doc, (watchers = new Map()));
  const previous = owners.get(observer);
  if (previous !== undefined && previous.documentObservers === watchers) {
    previous.box = box;
    previous.lastInline = previous.lastBlock = -1;
    targets.delete(previous);
    targets.add(previous);
  } else {
    const observation = new Observation(target, box, targets, watchers);
    targets.add(observation);
    owners.set(observer, observation);
    watchers.set(targets, (watchers.get(targets) ?? 0) + 1);
    collected.register(target, observation, observation);
    if (previous !== undefined) {
      collected.unregister(previous);
      forgetObservation(previous);
    }
  }
  chain = 0;
  schedule(doc);
}

function forgetObservation(o: Observation): void {
  const targets = o.targets;
  targets.delete(o);
  const watchers = o.documentObservers;
  const count = watchers.get(targets)!;
  if (count === 1) watchers.delete(targets);
  else watchers.set(targets, count - 1);
}

function unobserve(observer: ResizeObserver, target: Element): void {
  const owners = byTarget.get(target);
  if (owners === undefined) return;
  const observation = owners.get(observer);
  if (observation === undefined) return;
  owners.delete(observer);
  if (owners.size === 0) byTarget.delete(target);
  collected.unregister(observation);
  forgetObservation(observation);
}

function disconnect(observer: ResizeObserver): void {
  const targets = byObserver.get(observer);
  if (targets === undefined) return;
  for (const o of targets) {
    const target = o.deref();
    if (target !== undefined) unobserve(observer, target);
    else {
      collected.unregister(o);
      forgetObservation(o);
    }
  }
  byObserver.delete(observer);
}

/** https://drafts.csswg.org/resize-observer/#calculate-box-size */
function changedEntry(o: Observation, target: Element): ResizeObserverEntry | null {
  const impl = target[$impl];
  const box = boxOf(impl);
  const borderWidth = box?.w ?? 0;
  const borderHeight = box?.h ?? 0;
  const contentWidth = box === null ? 0 : Math.max(0, box.w - box.bl - box.br - box.pl - box.pr);
  const contentHeight = box === null ? 0 : Math.max(0, box.h - box.bt - box.bb - box.pt - box.pb);
  const dpr = box === null ? 1 : (impl.doc[$window] as Window)[$devicePixelRatio];
  const deviceWidth = Math.round(contentWidth * dpr);
  const deviceHeight = Math.round(contentHeight * dpr);
  let inline = contentWidth;
  let block = contentHeight;
  if (o.box === "border-box") {
    inline = borderWidth;
    block = borderHeight;
  } else if (o.box === "device-pixel-content-box") {
    inline = deviceWidth;
    block = deviceHeight;
  }
  if (inline === o.lastInline && block === o.lastBlock) return null;
  o.lastInline = inline;
  o.lastBlock = block;
  return new ResizeObserverEntry(
    target,
    new ResizeObserverSize(borderWidth, borderHeight),
    new ResizeObserverSize(contentWidth, contentHeight),
    new ResizeObserverSize(deviceWidth, deviceHeight),
    box?.pl ?? 0,
    box?.pt ?? 0,
  );
}

function runChecks(): void {
  scheduled = false;
  const docs = [...pending];
  pending.clear();
  let delivered = false;
  for (const doc of docs) {
    const watchers = byDocument.get(doc);
    if (watchers === undefined) continue;
    for (const targets of Array.from(watchers.keys())) {
      const observer = targets.observer.deref();
      if (observer === undefined) continue;
      // https://drafts.csswg.org/resize-observer/#gather-active-observations-h (isActive())
      const entries: ResizeObserverEntry[] = [];
      for (const o of targets) {
        const target = o.deref();
        if (target === undefined) continue;
        const entry = changedEntry(o, target);
        if (entry !== null) entries.push(entry);
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
  if (chain < 32 && byDocument.get(doc)?.size) schedule(doc);
});
