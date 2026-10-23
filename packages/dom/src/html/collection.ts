// HTMLCollection over a custom membership function (table.rows, tBodies, map.areas,
// document.images/links/..., media textTracks). Keeps dom-core's version-stamped caching by
// overriding `_collect`. The class is named HTMLCollection so pretty-format and
// `constructor.name` match browsers.

import { HTMLCollection as Base } from "../collections/HTMLCollection.ts";
import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { $fill } from "../keys.ts";

export type Fill = (root: NodeImpl, out: Element[]) => void;

const FnCollection = class HTMLCollection extends Base {
  declare [$fill]: Fill;

  constructor(root: NodeImpl, fill: Fill) {
    super(root, false, null);
    Object.defineProperty(this, $fill, { value: fill });
  }

  override _collect(out: Element[]): void {
    this[$fill](this._s.root, out);
  }
};

export function fnCollection(root: NodeImpl, fill: Fill): Base {
  return new FnCollection(root, fill);
}
