/**
 * Range and StaticRange: boundary points, comparisons and the content algorithms, differential
 * against jsdom. Rich-text editors, selection helpers and user-event's text input all go through
 * these (WPT dom/ranges covers them exhaustively but its fixtures carry no section links).
 *
 * Spec: DOM Standard §5 "Ranges"
 *   - AbstractRange / collapsed: https://dom.spec.whatwg.org/#interface-abstractrange
 *   - StaticRange: https://dom.spec.whatwg.org/#interface-staticrange
 *   - Range constructor, root, commonAncestorContainer: https://dom.spec.whatwg.org/#interface-range
 *   - set the start or end: https://dom.spec.whatwg.org/#concept-range-bp-set
 *   - select: https://dom.spec.whatwg.org/#concept-range-select
 *   - compareBoundaryPoints / comparePoint / isPointInRange / intersectsNode
 *   - contained / partially contained: https://dom.spec.whatwg.org/#contained
 *   - extract / clone / insert / surround: https://dom.spec.whatwg.org/#concept-range-extract
 *     (insertNode: https://dom.spec.whatwg.org/#dom-range-insertnode)
 *   - isPointInRange: https://dom.spec.whatwg.org/#dom-range-ispointinrange; detach: https://dom.spec.whatwg.org/#dom-range-detach
 *   - document.createRange: https://dom.spec.whatwg.org/#dom-document-createrange
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { describeNode, differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

const BODY = '<div id="root"><p id="a">abc<b id="b">def</b>ghi</p><p id="c">jkl</p></div>';

function setup(w: AnyWindow) {
  const d = w.document;
  d.body.innerHTML = BODY;
  const $ = (id: string) => d.getElementById(id);
  return { d, root: $("root"), a: $("a"), b: $("b"), c: $("c"), r: d.createRange() };
}

const bounds = (r: AnyWindow) => [describeNode(r.startContainer), r.startOffset, describeNode(r.endContainer), r.endOffset, r.collapsed];

/** Markup of a fragment (or node), through a scratch element. */
function html(d: AnyWindow, node: AnyWindow) {
  const div = d.createElement("div");
  div.appendChild(node);
  return div.innerHTML;
}

const tryName = (f: () => unknown) => {
  try {
    return f();
  } catch (e) {
    return `throws ${(e as Error).name}`;
  }
};

describe("Range constructor and root — https://dom.spec.whatwg.org/#dom-range-range", () => {
  differential("new Range() and createRange() start collapsed at (document, 0); root is the start node's root (https://dom.spec.whatwg.org/#concept-range-root)", (w) => {
    const r = new w.Range();
    const created = w.document.createRange();
    return { ctor: bounds(r), created: bounds(created), common: describeNode(r.commonAncestorContainer), live: r instanceof w.AbstractRange };
  });

  differential("commonAncestorContainer: the deepest inclusive ancestor of both boundary containers (https://dom.spec.whatwg.org/#dom-range-commonancestorcontainer)", (w) => {
    const { a, b, c, r } = setup(w);
    r.setStart(b.firstChild, 1);
    r.setEnd(b.firstChild, 2);
    const same = describeNode(r.commonAncestorContainer);
    r.setEnd(a.lastChild, 1);
    const siblings = describeNode(r.commonAncestorContainer);
    r.setEnd(c, 0);
    return [same, siblings, describeNode(r.commonAncestorContainer)];
  });
});

describe("set the start or end — https://dom.spec.whatwg.org/#concept-range-bp-set", () => {
  differential("step 1: doctype throws InvalidNodeTypeError; step 2: offset > length throws IndexSizeError", (w) => {
    const { d, a, r } = setup(w);
    return [tryName(() => r.setStart(d.doctype, 0)), tryName(() => r.setStart(a, 4)), tryName(() => r.setEnd(a.firstChild, 4)), tryName(() => r.setStart(a, 3))];
  });

  differential("step 4.1: a start after the end (or in another root) collapses the end onto it", (w) => {
    const { d, a, c, r } = setup(w);
    r.setStart(a, 0);
    r.setEnd(a, 2);
    r.setStart(c, 0);
    const afterEnd = bounds(r);
    const detached = d.createElement("div");
    r.setEnd(detached, 0);
    return { afterEnd, otherRoot: bounds(r) };
  });

  differential("step 4.2: an end before the start collapses the start onto it", (w) => {
    const { a, c, r } = setup(w);
    r.setStart(c, 1);
    r.setEnd(a, 1);
    return bounds(r);
  });

  differential("setStartBefore / setStartAfter / setEndBefore / setEndAfter use the parent and index; parentless nodes throw InvalidNodeTypeError", (w) => {
    const { d, a, b, r } = setup(w);
    r.setStartBefore(b);
    r.setEndAfter(b);
    const around = bounds(r);
    r.setEndBefore(a.lastChild);
    r.setStartAfter(a.firstChild);
    return { around, inner: bounds(r), parentless: tryName(() => r.setStartBefore(d.createElement("x"))) };
  });

  differential("collapse(toStart) moves one boundary onto the other; collapse() defaults to the end (https://dom.spec.whatwg.org/#dom-range-collapse)", (w) => {
    const { a, c, r } = setup(w);
    r.setStart(a, 1);
    r.setEnd(c, 1);
    const copy = r.cloneRange();
    r.collapse(true);
    copy.collapse();
    return [bounds(r), bounds(copy)];
  });
});

describe("select — https://dom.spec.whatwg.org/#concept-range-select", () => {
  differential("selectNode: (parent, index) to (parent, index + 1); a parentless node throws InvalidNodeTypeError", (w) => {
    const { d, b, r } = setup(w);
    r.selectNode(b);
    return { bounds: bounds(r), text: r.toString(), parentless: tryName(() => r.selectNode(d.createElement("i"))), documentNode: tryName(() => r.selectNode(d)) };
  });

  differential("selectNodeContents: (node, 0) to (node, length); doctypes throw (https://dom.spec.whatwg.org/#dom-range-selectnodecontents)", (w) => {
    const { d, a, b, r } = setup(w);
    r.selectNodeContents(a);
    const element = bounds(r);
    r.selectNodeContents(b.firstChild);
    return { element, text: bounds(r), doctype: tryName(() => r.selectNodeContents(d.doctype)) };
  });
});

describe("comparisons — https://dom.spec.whatwg.org/#dom-range-compareboundarypoints", () => {
  differential("compareBoundaryPoints: each how constant compares the right pair; bad how is NotSupportedError, other roots WrongDocumentError", (w) => {
    const { d, a, b, c, r } = setup(w);
    r.setStart(a, 1);
    r.setEnd(c, 0);
    const s = d.createRange();
    s.selectNode(b);
    const R = w.Range;
    const out = [R.START_TO_START, R.START_TO_END, R.END_TO_END, R.END_TO_START].map((how) => r.compareBoundaryPoints(how, s));
    const detached = d.createRange();
    detached.selectNodeContents(d.createElement("div"));
    return { out, bad: tryName(() => r.compareBoundaryPoints(4, s)), wrapsTo0: r.compareBoundaryPoints(65536, s), otherRoot: tryName(() => r.compareBoundaryPoints(0, detached)) };
  });

  differential("comparePoint / isPointInRange: -1, 0, 1 by boundary point position; other roots, doctypes and bad offsets (https://dom.spec.whatwg.org/#dom-range-comparepoint)", (w) => {
    const { d, a, b, c, r } = setup(w);
    r.setStart(b.firstChild, 1);
    r.setEnd(a.lastChild, 2);
    const points: [AnyWindow, number][] = [
      [a, 0],
      [b.firstChild, 1],
      [b, 1],
      [a.lastChild, 2],
      [c, 0],
    ];
    return {
      compare: points.map(([n, o]) => r.comparePoint(n, o)),
      inRange: points.map(([n, o]) => r.isPointInRange(n, o)),
      otherRoot: [tryName(() => r.comparePoint(d.createElement("x"), 0)), r.isPointInRange(d.createElement("x"), 0)],
      doctype: [tryName(() => r.comparePoint(d.doctype, 0)), tryName(() => r.isPointInRange(d.doctype, 0))],
      badOffset: [tryName(() => r.comparePoint(c, 5)), tryName(() => r.isPointInRange(c, 5))],
    };
  });

  differential("intersectsNode: true when the node's (parent, index)–(parent, index + 1) overlaps; parentless nodes only if in range's root (https://dom.spec.whatwg.org/#dom-range-intersectsnode)", (w) => {
    const { d, root, a, b, c, r } = setup(w);
    r.setStart(b.firstChild, 1);
    r.setEnd(a.lastChild, 1);
    return [root, a, b, a.firstChild, a.lastChild, c, d, d.createElement("x")].map((n) => r.intersectsNode(n));
  });
});

describe("contained and partially contained — https://dom.spec.whatwg.org/#contained", () => {
  differential("deleteContents: contained nodes are removed, partially contained Text is truncated, and the range collapses at the new position (https://dom.spec.whatwg.org/#dom-range-deletecontents)", (w) => {
    const { d, root, a, c, r } = setup(w);
    r.setStart(a.firstChild, 1);
    r.setEnd(c.firstChild, 2);
    r.deleteContents();
    return { html: root.innerHTML, bounds: bounds(r), doc: d.body.contains(c) };
  });

  differential("deleteContents within one CharacterData node replaces its data (step 4)", (w) => {
    const { b, r } = setup(w);
    r.setStart(b.firstChild, 1);
    r.setEnd(b.firstChild, 2);
    r.deleteContents();
    return [b.textContent, bounds(r)];
  });

  differential("extractContents: partially contained ancestors are cloned shallow into the fragment, contained nodes moved (https://dom.spec.whatwg.org/#dom-range-extractcontents)", (w) => {
    const { d, root, a, b, c, r } = setup(w);
    r.setStart(b.firstChild, 1);
    r.setEnd(c.firstChild, 1);
    const frag = r.extractContents();
    return { extracted: html(d, frag), left: root.innerHTML, bounds: bounds(r), bStillInTree: root.contains(b) };
  });

  differential("cloneContents leaves the tree alone and copies the same shape (https://dom.spec.whatwg.org/#dom-range-clonecontents)", (w) => {
    const { d, root, a, b, r } = setup(w);
    r.setStart(a.firstChild, 2);
    r.setEnd(b.firstChild, 2);
    const before = root.innerHTML;
    const frag = r.cloneContents();
    return { cloned: html(d, frag), unchanged: root.innerHTML === before, clonedIsCopy: frag.querySelector("b") !== b };
  });

  differential("extract / clone: a doctype among the contained children throws HierarchyRequestError before anything moves", (w) => {
    const doc = w.document.implementation.createHTMLDocument("t");
    const r = doc.createRange();
    r.setStart(doc, 0);
    r.setEnd(doc, 2);
    return [tryName(() => r.cloneContents()), tryName(() => r.extractContents()), doc.childNodes.length];
  });

  differential("toString: the Text data between the boundary points, in tree order (https://dom.spec.whatwg.org/#dom-range-stringifier)", (w) => {
    const { a, c, r } = setup(w);
    r.setStart(a.firstChild, 1);
    r.setEnd(c.firstChild, 2);
    return r.toString();
  });
});

describe("insert — https://dom.spec.whatwg.org/#concept-range-insert", () => {
  differential("insertNode into Text splits it and inserts before the tail; a collapsed range then spans the node", (w) => {
    const { d, a, r } = setup(w);
    r.setStart(a.firstChild, 1);
    const node = d.createElement("i");
    r.insertNode(node);
    return { html: a.innerHTML, bounds: bounds(r) };
  });

  differential("insertNode of a fragment: the range end moves past all inserted children when collapsed", (w) => {
    const { d, c, r } = setup(w);
    r.setStart(c, 0);
    const frag = d.createDocumentFragment();
    frag.append(d.createElement("x"), "y");
    r.insertNode(frag);
    return { html: c.innerHTML, bounds: bounds(r) };
  });

  differential("steps 1–3: start in a comment, a Text node with no parent, or the node itself throws HierarchyRequestError", (w) => {
    const { d, a, r } = setup(w);
    const comment = a.appendChild(d.createComment("c"));
    r.setStart(comment, 0);
    const inComment = tryName(() => r.insertNode(d.createElement("i")));
    r.setStart(d.createTextNode("loose"), 0);
    const loose = tryName(() => r.insertNode(d.createElement("i")));
    const target = a.firstChild;
    r.setStart(target, 0);
    return [inComment, loose, tryName(() => r.insertNode(target))];
  });
});

describe("surroundContents — https://dom.spec.whatwg.org/#dom-range-surroundcontents", () => {
  differential("wraps the range's contents in newParent and selects it", (w) => {
    const { d, a, r } = setup(w);
    r.setStart(a.firstChild, 1);
    r.setEnd(a.lastChild, 1);
    const span = d.createElement("span");
    span.textContent = "dropped";
    r.surroundContents(span);
    return { html: a.innerHTML, bounds: bounds(r) };
  });

  differential("step 1: a partially contained non-Text node throws InvalidStateError; step 2: documents, doctypes and fragments are InvalidNodeTypeError", (w) => {
    const { d, a, c, r } = setup(w);
    r.setStart(a.firstChild, 1);
    r.setEnd(c.firstChild, 1);
    const partial = tryName(() => r.surroundContents(d.createElement("span")));
    r.selectNodeContents(c);
    return [partial, tryName(() => r.surroundContents(d.createDocumentFragment())), tryName(() => r.surroundContents(d.implementation.createDocumentType("x", "", ""))), a.parentNode.innerHTML.length];
  });
});

describe("cloneRange / detach — https://dom.spec.whatwg.org/#dom-range-clonerange", () => {
  differential("cloneRange copies the boundary points into a new, independent live range; detach does nothing", (w) => {
    const { a, b, r } = setup(w);
    r.setStart(a, 1);
    r.setEnd(b.firstChild, 2);
    const clone = r.cloneRange();
    r.collapse(true);
    clone.detach();
    return { clone: bounds(clone), original: bounds(r), distinct: clone !== r };
  });
});

describe("live range updates — https://dom.spec.whatwg.org/#concept-live-range", () => {
  differential("removing steps 4–7: boundary points inside a removed subtree move to (parent, index); later offsets in the parent shift down", (w) => {
    const { root, a, b, c, r } = setup(w);
    r.setStart(b.firstChild, 1);
    r.setEnd(root, 2);
    const after = w.document.createRange();
    after.setStart(c, 0);
    a.remove();
    return { r: bounds(r), after: bounds(after) };
  });

  differential("insertion steps: offsets after the insertion index in the parent shift up by the number of inserted nodes", (w) => {
    const { d, root, r } = setup(w);
    r.setStart(root, 1);
    r.setEnd(root, 2);
    const frag = d.createDocumentFragment();
    frag.append(d.createElement("x"), d.createElement("y"));
    root.insertBefore(frag, root.firstChild);
    return bounds(r);
  });

  test("ranges in a removed shadow tree stay put (they are rooted in the shadow root, not the document)", () => {
    const { document } = createWindow();
    const host = document.body!.appendChild(document.createElement("div"));
    const shadow = host.attachShadow({ mode: "open" });
    const text = shadow.appendChild(document.createTextNode("abc"));
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 2);
    host.remove();
    expect([range.startContainer, range.startOffset, range.endOffset]).toEqual([text, 1, 2]);
  });
});

describe("StaticRange — https://dom.spec.whatwg.org/#interface-staticrange", () => {
  differential("constructor: step 1 doctype or Attr containers throw InvalidNodeTypeError; offsets are not validated against node length", (w) => {
    const d = w.document;
    const text = d.createTextNode("abc");
    const ok = new w.StaticRange({ startContainer: text, startOffset: 10, endContainer: d.body, endOffset: 0 });
    return {
      ok: [describeNode(ok.startContainer), ok.startOffset, describeNode(ok.endContainer), ok.endOffset, ok.collapsed],
      attr: tryName(() => new w.StaticRange({ startContainer: d.createAttribute("a"), startOffset: 0, endContainer: text, endOffset: 0 })),
      doctype: tryName(() => new w.StaticRange({ startContainer: text, startOffset: 0, endContainer: d.doctype, endOffset: 0 })),
      missing: tryName(() => new w.StaticRange({ startContainer: text, startOffset: 0 })),
      abstract: ok instanceof w.AbstractRange && !(ok instanceof w.Range),
    };
  });

  differential("collapsed compares the stored nodes and offsets only (https://dom.spec.whatwg.org/#range-collapsed)", (w) => {
    const d = w.document;
    const t = d.createTextNode("abc");
    const same = new w.StaticRange({ startContainer: t, startOffset: 1, endContainer: t, endOffset: 1 });
    const backwards = new w.StaticRange({ startContainer: t, startOffset: 2, endContainer: t, endOffset: 1 });
    return [same.collapsed, backwards.collapsed];
  });
});
