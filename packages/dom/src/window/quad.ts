// https://drafts.csswg.org/geometry/#DOMQuad — DOMQuad: four DOMPoints and their bounding box.
//
// Kept apart from geometry.ts, which it only reads: the points are ordinary DOMPoints, and
// getBounds() returns an ordinary DOMRect.

import { defineInterfaceShape, exposeMembers } from "../webidl-runtime.ts";
import { DOMPoint, DOMRect, type DOMPointInit, type DOMRectInit } from "./geometry.ts";

/** https://drafts.csswg.org/geometry/#dictdef-domquadinit */
export interface DOMQuadInit {
  p1?: DOMPointInit;
  p2?: DOMPointInit;
  p3?: DOMPointInit;
  p4?: DOMPointInit;
}

/**
 * WebIDL dictionary conversion (https://webidl.spec.whatwg.org/#js-dictionary): undefined and
 * null are the empty dictionary, any other non-object is a TypeError. Members are read in
 * lexicographic order and converted with ToNumber (`unrestricted double`).
 */
function dictionary(value: unknown, method: string, type: string): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" && typeof value !== "function") {
    throw new TypeError(`Failed to ${method}: The provided value is not of type '${type}'.`);
  }
  return value as Record<string, unknown>;
}

/** WebIDL `unrestricted double` dictionary member with a default. */
function number(v: unknown, fallback: number): number {
  return v === undefined ? fallback : Number(v);
}

/** A new DOMPoint from a DOMPointInit, as https://drafts.csswg.org/geometry/#dom-dompointreadonly-frompoint does. */
function pointFromInit(init: unknown, method: string): DOMPoint {
  const d = dictionary(init, method, "DOMPointInit");
  if (d === null) return new DOMPoint();
  const w = number(d.w, 1);
  const x = number(d.x, 0);
  const y = number(d.y, 0);
  const z = number(d.z, 0);
  return new DOMPoint(x, y, z, w);
}

// The points of the quad that `quadOf` is constructing, adopted by the constructor as they are.
let adopt1: DOMPoint | null = null;
let adopt2: DOMPoint | null = null;
let adopt3: DOMPoint | null = null;
let adopt4: DOMPoint | null = null;

/**
 * A new DOMQuad that holds these four points, which the caller has just created. The public
 * constructor would convert each one again: four more points and sixteen member reads.
 */
function quadOf(p1: DOMPoint, p2: DOMPoint, p3: DOMPoint, p4: DOMPoint): DOMQuad {
  adopt1 = p1;
  adopt2 = p2;
  adopt3 = p3;
  adopt4 = p4;
  return new DOMQuad();
}

/** https://drafts.csswg.org/geometry/#domquad */
export class DOMQuad {
  #p1: DOMPoint;
  #p2: DOMPoint;
  #p3: DOMPoint;
  #p4: DOMPoint;

  /** https://drafts.csswg.org/geometry/#dom-domquad-domquad */
  constructor(p1?: DOMPointInit, p2?: DOMPointInit, p3?: DOMPointInit, p4?: DOMPointInit) {
    const adopted = adopt1;
    if (adopted !== null) {
      this.#p1 = adopted;
      this.#p2 = adopt2!;
      this.#p3 = adopt3!;
      this.#p4 = adopt4!;
      adopt1 = adopt2 = adopt3 = adopt4 = null;
      return;
    }
    // Steps 1-4: a new DOMPoint from each dictionary, then the quad holds them.
    const method = "construct 'DOMQuad'";
    this.#p1 = pointFromInit(p1, method);
    this.#p2 = pointFromInit(p2, method);
    this.#p3 = pointFromInit(p3, method);
    this.#p4 = pointFromInit(p4, method);
  }

  /** https://drafts.csswg.org/geometry/#dom-domquad-fromrect */
  static fromRect(other?: DOMRectInit): DOMQuad {
    const d = dictionary(other, "execute 'fromRect' on 'DOMQuad'", "DOMRectInit");
    // Members in lexicographic order: height, width, x, y.
    const height = d === null ? 0 : number(d.height, 0);
    const width = d === null ? 0 : number(d.width, 0);
    const x = d === null ? 0 : number(d.x, 0);
    const y = d === null ? 0 : number(d.y, 0);
    // The four corners, clockwise from (x, y).
    return quadOf(
      new DOMPoint(x, y, 0, 1),
      new DOMPoint(x + width, y, 0, 1),
      new DOMPoint(x + width, y + height, 0, 1),
      new DOMPoint(x, y + height, 0, 1),
    );
  }

  /** https://drafts.csswg.org/geometry/#dom-domquad-fromquad */
  static fromQuad(other?: DOMQuadInit): DOMQuad {
    const method = "execute 'fromQuad' on 'DOMQuad'";
    const d = dictionary(other, method, "DOMQuadInit");
    if (d === null) return new DOMQuad();
    return quadOf(
      pointFromInit(d.p1, method),
      pointFromInit(d.p2, method),
      pointFromInit(d.p3, method),
      pointFromInit(d.p4, method),
    );
  }

  /** https://drafts.csswg.org/geometry/#dom-domquad-p1 — [SameObject]. */
  get p1(): DOMPoint {
    return this.#p1;
  }
  get p2(): DOMPoint {
    return this.#p2;
  }
  get p3(): DOMPoint {
    return this.#p3;
  }
  get p4(): DOMPoint {
    return this.#p4;
  }

  /**
   * https://drafts.csswg.org/geometry/#dom-domquad-getbounds — the NaN-safe minimum and maximum
   * of the x and y coordinates: any NaN makes that edge NaN, which Math.min/max already do.
   */
  getBounds(): DOMRect {
    const a = this.#p1;
    const b = this.#p2;
    const c = this.#p3;
    const d = this.#p4;
    const left = Math.min(a.x, b.x, c.x, d.x);
    const top = Math.min(a.y, b.y, c.y, d.y);
    const right = Math.max(a.x, b.x, c.x, d.x);
    const bottom = Math.max(a.y, b.y, c.y, d.y);
    return new DOMRect(left, top, right - left, bottom - top);
  }

  /** https://webidl.spec.whatwg.org/#default-tojson-steps — each point via its own toJSON. */
  toJSON(): {
    p1: Required<DOMPointInit>;
    p2: Required<DOMPointInit>;
    p3: Required<DOMPointInit>;
    p4: Required<DOMPointInit>;
  } {
    return { p1: this.#p1.toJSON(), p2: this.#p2.toJSON(), p3: this.#p3.toJSON(), p4: this.#p4.toJSON() };
  }
}

exposeMembers(DOMQuad);
defineInterfaceShape(DOMQuad);
