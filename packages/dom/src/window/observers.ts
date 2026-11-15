// https://drafts.csswg.org/resize-observer/#resize-observer-interface
// https://w3c.github.io/IntersectionObserver/#intersection-observer-interface
//
// There is no layout, so nothing is ever observed to resize or intersect: these are
// well-behaved no-ops (argument validation, observe/unobserve/disconnect bookkeeping,
// takeRecords) for the many component libraries that construct them unconditionally.
// Callbacks are never invoked (docs/deviations.md). Tests that need entries mock them.
// Exception: with `layout: "lite"` (docs/layout.md) css/resize-observer.ts registers
// `resizeObserverHooks` and delivers ResizeObserver entries from layout-lite boxes.

import type { Element } from "../nodes/Element.ts";
import { $callback, $targets } from "../keys.ts";
import { DOMRectReadOnly, type DOMRectInit } from "./geometry.ts";
import { defineInterfaceShape, exposeMembers } from "../webidl-runtime.ts";

type ResizeObserverCallback = (entries: unknown[], observer: ResizeObserver) => void;
type IntersectionObserverCallback = (entries: unknown[], observer: IntersectionObserver) => void;

/** @internal Set by css/resize-observer.ts (layout-lite delivery); null hooks mean "no layout". */
export const resizeObserverHooks: {
  observe: ((observer: ResizeObserver, target: Element, box: string) => void) | null;
  unobserve: ((observer: ResizeObserver, target: Element) => void) | null;
  disconnect: ((observer: ResizeObserver) => void) | null;
} = { observe: null, unobserve: null, disconnect: null };

export class ResizeObserver {
  [$callback]: ResizeObserverCallback;
  [$targets]: Set<Element>;

  constructor(callback: ResizeObserverCallback) {
    if (typeof callback !== "function") {
      throw new TypeError("Failed to construct 'ResizeObserver': parameter 1 is not of type 'ResizeObserverCallback'.");
    }
    this[$callback] = callback;
    this[$targets] = new Set();
  }

  observe(target: Element, options?: { box?: string }): void {
    if (target === null || typeof target !== "object") {
      throw new TypeError("Failed to execute 'observe' on 'ResizeObserver': parameter 1 is not of type 'Element'.");
    }
    this[$targets].add(target);
    resizeObserverHooks.observe?.(this, target, options?.box === undefined ? "content-box" : String(options.box));
  }

  unobserve(target: Element): void {
    this[$targets].delete(target);
    resizeObserverHooks.unobserve?.(this, target);
  }

  disconnect(): void {
    this[$targets].clear();
    resizeObserverHooks.disconnect?.(this);
  }

  get [Symbol.toStringTag](): string {
    return "ResizeObserver";
  }
}

export interface IntersectionObserverInit {
  root?: Element | null;
  rootMargin?: string;
  scrollMargin?: string;
  threshold?: number | number[];
}

export class IntersectionObserver {
  [$callback]: IntersectionObserverCallback;
  [$targets]: Set<Element>;
  readonly root: Element | null;
  readonly rootMargin: string;
  readonly scrollMargin: string;
  readonly thresholds: readonly number[];

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    if (typeof callback !== "function") {
      throw new TypeError(
        "Failed to construct 'IntersectionObserver': parameter 1 is not of type 'IntersectionObserverCallback'.",
      );
    }
    this[$callback] = callback;
    this[$targets] = new Set();
    this.root = options.root ?? null;
    this.rootMargin = normalizeMargin(options.rootMargin ?? "0px");
    this.scrollMargin = normalizeMargin(options.scrollMargin ?? "0px");
    const t = options.threshold ?? 0;
    const thresholds = (Array.isArray(t) ? t : [t]).map(Number);
    for (const n of thresholds) {
      if (!(n >= 0 && n <= 1)) {
        throw new RangeError(
          "Failed to construct 'IntersectionObserver': Threshold values must be numbers between 0 and 1",
        );
      }
    }
    this.thresholds = Object.freeze(thresholds.sort((a, b) => a - b));
  }

  observe(target: Element): void {
    this[$targets].add(target);
  }

  unobserve(target: Element): void {
    this[$targets].delete(target);
  }

  disconnect(): void {
    this[$targets].clear();
  }

  takeRecords(): unknown[] {
    return [];
  }

  get [Symbol.toStringTag](): string {
    return "IntersectionObserver";
  }
}

/** https://w3c.github.io/IntersectionObserver/#dictdef-intersectionobserverentryinit */
export interface IntersectionObserverEntryInit {
  time: number;
  rootBounds: DOMRectInit | null;
  boundingClientRect: DOMRectInit;
  intersectionRect: DOMRectInit;
  isIntersecting: boolean;
  intersectionRatio: number;
  target: Element;
}

/**
 * https://w3c.github.io/IntersectionObserver/#intersection-observer-entry — never delivered here
 * (no layout), but exposed with IntersectionObserver: libraries check
 * `"isIntersecting" in IntersectionObserverEntry.prototype` before trusting the observer
 * (react-lazy-load-image-component), and test mocks construct entries.
 */
export class IntersectionObserverEntry {
  #time: number;
  #rootBounds: DOMRectReadOnly | null;
  #boundingClientRect: DOMRectReadOnly;
  #intersectionRect: DOMRectReadOnly;
  #isIntersecting: boolean;
  #intersectionRatio: number;
  #target: Element;

  constructor(init: IntersectionObserverEntryInit) {
    // WebIDL dictionary conversion: members in lexicographic order, all required.
    const ctx = "Failed to construct 'IntersectionObserverEntry'";
    if (init === null || init === undefined || typeof init !== "object") {
      throw new TypeError(`${ctx}: 1 argument required, but only 0 present.`);
    }
    const required = <T>(name: keyof IntersectionObserverEntryInit): T => {
      const v = init[name];
      if (v === undefined)
        throw new TypeError(
          `${ctx}: Failed to read the '${name}' property from 'IntersectionObserverEntryInit': Required member is undefined.`,
        );
      return v as T;
    };
    this.#boundingClientRect = DOMRectReadOnly.fromRect(required<DOMRectInit>("boundingClientRect"));
    this.#intersectionRatio = Number(required("intersectionRatio"));
    this.#intersectionRect = DOMRectReadOnly.fromRect(required<DOMRectInit>("intersectionRect"));
    this.#isIntersecting = Boolean(required("isIntersecting"));
    const rootBounds = required<DOMRectInit | null>("rootBounds");
    this.#rootBounds = rootBounds === null ? null : DOMRectReadOnly.fromRect(rootBounds);
    const target = required<Element>("target");
    if (typeof target !== "object" || (target as { nodeType?: unknown }).nodeType !== 1) {
      throw new TypeError(
        `${ctx}: Failed to read the 'target' property from 'IntersectionObserverEntryInit': Failed to convert value to 'Element'.`,
      );
    }
    this.#target = target;
    this.#time = Number(required("time"));
  }

  get time(): number {
    return this.#time;
  }
  get rootBounds(): DOMRectReadOnly | null {
    return this.#rootBounds;
  }
  get boundingClientRect(): DOMRectReadOnly {
    return this.#boundingClientRect;
  }
  get intersectionRect(): DOMRectReadOnly {
    return this.#intersectionRect;
  }
  get isIntersecting(): boolean {
    return this.#isIntersecting;
  }
  get intersectionRatio(): number {
    return this.#intersectionRatio;
  }
  get target(): Element {
    return this.#target;
  }
}

exposeMembers(IntersectionObserverEntry);
defineInterfaceShape(IntersectionObserverEntry, { constructor: 1 });

/** https://w3c.github.io/IntersectionObserver/#parse-a-margin (serialization: 4 lengths) */
function normalizeMargin(margin: string): string {
  const parts = String(margin).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) parts.push("0px");
  for (const p of parts) {
    if (!/^-?(\d+|\d*\.\d+)(px|%)$/.test(p) && p !== "0") {
      throw new DOMException(
        "Failed to construct 'IntersectionObserver': rootMargin must be specified in pixels or percent.",
        "SyntaxError",
      );
    }
  }
  const px = parts.map((p) => (p === "0" ? "0px" : p));
  const [top, right = top, bottom = top, left = right] = px;
  return `${top} ${right} ${bottom} ${left}`;
}
