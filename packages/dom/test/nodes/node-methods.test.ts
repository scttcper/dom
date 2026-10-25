/**
 * Node methods that compare, search and reshape trees, differential against jsdom where it
 * implements the algorithm, otherwise pinned to the spec steps.
 *
 * Spec: DOM Standard §4.4 "Interface Node", §4.10–4.14 CharacterData / Text / Comment, §1 trees
 *   - tree order, index, root: https://dom.spec.whatwg.org/#concept-tree-order
 *   - compareDocumentPosition: https://dom.spec.whatwg.org/#dom-node-comparedocumentposition
 *   - contains: https://dom.spec.whatwg.org/#dom-node-contains
 *   - isEqualNode / "equals": https://dom.spec.whatwg.org/#concept-node-equals
 *   - namespace lookups: https://dom.spec.whatwg.org/#locate-a-namespace-prefix
 *     (lookupNamespaceURI: https://dom.spec.whatwg.org/#dom-node-lookupnamespaceuri,
 *     isDefaultNamespace: https://dom.spec.whatwg.org/#dom-node-isdefaultnamespace)
 *   - normalize: https://dom.spec.whatwg.org/#dom-node-normalize
 *   - textContent: https://dom.spec.whatwg.org/#concept-descendant-text-content
 *   - getRootNode: https://dom.spec.whatwg.org/#concept-shadow-including-root
 *   - CharacterData "replace data": https://dom.spec.whatwg.org/#concept-cd-replace
 *   - Text "split": https://dom.spec.whatwg.org/#concept-text-split
 *     (splitText: https://dom.spec.whatwg.org/#dom-text-splittext)
 *   - Comment constructor: https://dom.spec.whatwg.org/#interface-comment
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@ctrl/dom";
import { describeNode, differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

/** <div id=root><p id=a>one<b id=b>two</b></p><p id=c>three</p></div> appended to body. */
function tree(w: AnyWindow) {
  const d = w.document;
  d.body.innerHTML = '<div id="root"><p id="a">one<b id="b">two</b></p><p id="c">three</p></div>';
  const $ = (id: string) => d.getElementById(id);
  return { d, root: $("root"), a: $("a"), b: $("b"), c: $("c") };
}

describe("tree order, index and root — https://dom.spec.whatwg.org/#concept-tree-order", () => {
  test("index: the number of preceding siblings (https://dom.spec.whatwg.org/#concept-tree-index)", () => {
    // Observable through Range offsets: setStartBefore(node) puts the boundary at (parent, index).
    const parent = document.createElement("div");
    const kids = [document.createElement("a"), document.createTextNode("t"), document.createComment("c")];
    for (const k of kids) parent.appendChild(k);
    const range = document.createRange();
    expect(
      kids.map((k) => {
        range.setStartBefore(k);
        return range.startOffset;
      }),
    ).toEqual([0, 1, 2]);
  });

  test("root: a detached subtree's root is its topmost ancestor (https://dom.spec.whatwg.org/#concept-tree-root)", () => {
    const top = document.createElement("section");
    const leaf = top.appendChild(document.createElement("div")).appendChild(document.createTextNode("x"));
    expect(leaf.getRootNode()).toBe(top);
    expect(top.getRootNode()).toBe(top);
    expect(document.body!.getRootNode()).toBe(document);
  });

  test("shadow-including root: getRootNode({ composed: true }) crosses shadow roots (https://dom.spec.whatwg.org/#concept-shadow-including-root)", () => {
    const host = document.body!.appendChild(document.createElement("div"));
    const shadow = host.attachShadow({ mode: "closed" });
    const inner = shadow.appendChild(document.createElement("span"));
    expect(inner.getRootNode()).toBe(shadow);
    expect(inner.getRootNode({ composed: true })).toBe(document);
    const detachedHost = document.createElement("div");
    const detachedInner = detachedHost.attachShadow({ mode: "open" }).appendChild(document.createElement("i"));
    expect(detachedInner.getRootNode({ composed: true })).toBe(detachedHost);
  });
});

describe("compareDocumentPosition — https://dom.spec.whatwg.org/#dom-node-comparedocumentposition", () => {
  differential("steps 1–8 and 9–11: same node, ancestors, descendants, preceding and following elements", (w) => {
    const { root, a, b, c } = tree(w);
    return {
      same: a.compareDocumentPosition(a),
      ancestor: b.compareDocumentPosition(root),
      descendant: root.compareDocumentPosition(b),
      preceding: c.compareDocumentPosition(b),
      following: b.compareDocumentPosition(c),
      textInside: a.compareDocumentPosition(a.firstChild),
    };
  });

  differential(
    "steps 4–5: attributes of one element compare by attribute list order, after their element",
    (w) => {
      const el = w.document.createElement("div");
      el.setAttribute("x", "1");
      el.setAttribute("y", "2");
      const [x, y] = [el.getAttributeNode("x"), el.getAttributeNode("y")];
      const child = el.appendChild(w.document.createElement("span"));
      return {
        xToY: y.compareDocumentPosition(x),
        yToX: x.compareDocumentPosition(y),
        elementToAttr: x.compareDocumentPosition(el),
        attrToElement: el.compareDocumentPosition(x),
        // Step 8: an attribute's "node1" is replaced by its element, so a child of the element
        // follows the attribute and is not contained by it.
        childToAttr: x.compareDocumentPosition(child),
      };
    },
    {
      jsdomFix: {
        fix: (o) => ({ ...o, elementToAttr: 10, attrToElement: 20, childToAttr: 4 }),
        spec: "https://dom.spec.whatwg.org/#dom-node-comparedocumentposition",
        reason:
          "jsdom returns 0 between an attribute and its own element (steps 7–8 give CONTAINS|PRECEDING / CONTAINED_BY|FOLLOWING) and treats the element's children as contained by its attributes (step 8 needs attr2 to be null)",
      },
    },
  );

  test("step 6: nodes in different trees are DISCONNECTED | IMPLEMENTATION_SPECIFIC with a consistent PRECEDING/FOLLOWING bit", () => {
    const one = document.createElement("div");
    const two = document.createElement("div");
    const ab = one.compareDocumentPosition(two);
    const ba = two.compareDocumentPosition(one);
    const DISCONNECTED = 1;
    const IMPLEMENTATION_SPECIFIC = 32;
    expect(ab & (DISCONNECTED | IMPLEMENTATION_SPECIFIC)).toBe(DISCONNECTED | IMPLEMENTATION_SPECIFIC);
    expect(ba & (DISCONNECTED | IMPLEMENTATION_SPECIFIC)).toBe(DISCONNECTED | IMPLEMENTATION_SPECIFIC);
    // "consistent": exactly one of PRECEDING (2) / FOLLOWING (4) each way, and opposite ones.
    expect([ab & 6, ba & 6].sort()).toEqual([2, 4]);
    expect(one.compareDocumentPosition(two)).toBe(ab);
  });

  test("step 6: a node in a shadow tree and its host's document are disconnected (shadow roots are separate trees)", () => {
    const host = document.body!.appendChild(document.createElement("div"));
    const inner = host.attachShadow({ mode: "open" }).appendChild(document.createElement("span"));
    expect(inner.compareDocumentPosition(host) & 1).toBe(1);
  });
});

describe("contains — https://dom.spec.whatwg.org/#dom-node-contains", () => {
  differential("returns true for inclusive descendants, false for null, ancestors, siblings and other trees", (w) => {
    const { d, root, a, b, c } = tree(w);
    return [
      root.contains(root),
      root.contains(b),
      root.contains(b.firstChild),
      b.contains(root),
      a.contains(c),
      a.contains(null),
      d.contains(b),
      root.contains(d.createElement("div")),
    ];
  });

  test("does not cross shadow boundaries: a host does not contain its shadow tree", () => {
    const host = document.body!.appendChild(document.createElement("div"));
    const inner = host.attachShadow({ mode: "open" }).appendChild(document.createElement("span"));
    expect(host.contains(inner)).toBe(false);
    expect(document.contains(inner)).toBe(false);
  });
});

describe("isEqualNode — https://dom.spec.whatwg.org/#concept-node-equals", () => {
  differential(
    "step 1: same nodeType and type-specific fields; step 3: attributes in any order; step 5: children pairwise",
    (w) => {
      const d = w.document;
      const make = (html: string) => {
        const t = d.createElement("template");
        t.innerHTML = html;
        return t.content.firstChild;
      };
      return {
        attrOrder: make('<p a="1" b="2">x</p>').isEqualNode(make('<p b="2" a="1">x</p>')),
        attrValue: make('<p a="1">x</p>').isEqualNode(make('<p a="2">x</p>')),
        attrCount: make('<p a="1">x</p>').isEqualNode(make('<p a="1" b="">x</p>')),
        childText: make("<p>x</p>").isEqualNode(make("<p>y</p>")),
        childCount: make("<p>x</p>").isEqualNode(make("<p>x<i></i></p>")),
        deep: make("<ul><li>a<b>c</b></li></ul>").isEqualNode(make("<ul><li>a<b>c</b></li></ul>")),
        localName: d.createElement("p").isEqualNode(d.createElement("div")),
        namespace: d.createElement("p").isEqualNode(d.createElementNS("urn:x", "p")),
        prefix: d.createElementNS("urn:x", "a:p").isEqualNode(d.createElementNS("urn:x", "b:p")),
        comment: d.createComment("c").isEqualNode(d.createComment("c")),
        textVsComment: d.createTextNode("c").isEqualNode(d.createComment("c")),
        pi: d.createProcessingInstruction("t", "d").isEqualNode(d.createProcessingInstruction("t", "e")),
        doctype: d.implementation
          .createDocumentType("html", "a", "b")
          .isEqualNode(d.implementation.createDocumentType("html", "a", "c")),
        null: d.createElement("p").isEqualNode(null),
        fragments: d.createDocumentFragment().isEqualNode(d.createDocumentFragment()),
      };
    },
  );

  differential("attributes compare namespace, local name and value, not the prefix", (w) => {
    const d = w.document;
    const x = d.createElement("p");
    const y = d.createElement("p");
    x.setAttributeNS("urn:a", "p:attr", "v");
    y.setAttributeNS("urn:a", "q:attr", "v");
    const z = d.createElement("p");
    z.setAttributeNS("urn:b", "p:attr", "v");
    return { prefixOnly: x.isEqualNode(y), otherNamespace: x.isEqualNode(z) };
  });

  test("isSameNode is identity, not equality (https://dom.spec.whatwg.org/#dom-node-issamenode)", () => {
    const a = document.createElement("p");
    expect(a.isSameNode(a)).toBe(true);
    expect(a.isSameNode(a.cloneNode(true))).toBe(false);
    expect(a.isEqualNode(a.cloneNode(true))).toBe(true);
  });
});

describe("namespace prefix lookups — https://dom.spec.whatwg.org/#locate-a-namespace-prefix", () => {
  differential(
    "lookupPrefix: element's own prefix, then xmlns:* attributes, then ancestors; null for null/empty namespace",
    (w) => {
      const d = w.document;
      const root = d.createElementNS("urn:root", "r:root");
      root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:x", "urn:x");
      const mid = root.appendChild(d.createElementNS("urn:mid", "mid"));
      const text = mid.appendChild(d.createTextNode("t"));
      return {
        own: root.lookupPrefix("urn:root"),
        viaAttr: mid.lookupPrefix("urn:x"),
        inherited: mid.lookupPrefix("urn:root"),
        defaultNs: mid.lookupPrefix("urn:mid"),
        fromText: text.lookupPrefix("urn:x"),
        nullNs: mid.lookupPrefix(null),
        emptyNs: mid.lookupPrefix(""),
        unknown: mid.lookupPrefix("urn:none"),
        document: d.lookupPrefix("http://www.w3.org/1999/xhtml"),
        fragment: d.createDocumentFragment().lookupPrefix("urn:x"),
        doctype: d.doctype ? d.doctype.lookupPrefix("urn:x") : "no doctype",
      };
    },
  );

  differential("lookupNamespaceURI: xml/xmlns are fixed, default namespace via xmlns, empty string means null", (w) => {
    const d = w.document;
    const root = d.createElementNS("urn:root", "root");
    root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns", "urn:default");
    root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:e", "");
    const child = root.appendChild(d.createElementNS(null, "child"));
    const attrNode = (root.setAttribute("plain", "1"), root.getAttributeNode("plain"));
    return {
      xml: child.lookupNamespaceURI("xml"),
      xmlns: child.lookupNamespaceURI("xmlns"),
      rootDefault: root.lookupNamespaceURI(null),
      rootEmptyString: root.lookupNamespaceURI(""),
      childDefault: child.lookupNamespaceURI(null),
      emptyBinding: child.lookupNamespaceURI("e"),
      attr: attrNode.lookupNamespaceURI(null),
      document: d.lookupNamespaceURI(null),
      body: d.body.lookupNamespaceURI(null),
      isDefaultHtml: d.body.isDefaultNamespace("http://www.w3.org/1999/xhtml"),
      isDefaultEmpty: child.isDefaultNamespace(""),
      isDefaultNull: child.isDefaultNamespace(null),
    };
  });
});

describe("normalize — https://dom.spec.whatwg.org/#dom-node-normalize", () => {
  differential("step 1.1–1.2: empty Text nodes are removed; contiguous Text nodes merge into the first", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    p.append(
      d.createTextNode(""),
      d.createTextNode("a"),
      d.createTextNode(""),
      d.createTextNode("b"),
      d.createElement("i"),
      d.createTextNode("c"),
      d.createTextNode("d"),
    );
    const first = p.childNodes[1];
    const i = p.childNodes[4];
    i.append(d.createTextNode("x"), d.createTextNode("y"));
    p.normalize();
    return {
      children: [...p.childNodes].map((n: AnyWindow) => describeNode(n)),
      firstKept: p.firstChild === first,
      nested: [...i.childNodes].map((n: AnyWindow) => n.data),
    };
  });

  differential(
    "steps 1.4–1.5: live ranges move from merged nodes into the surviving node, offsets shifted by its old length",
    (w) => {
      const d = w.document;
      const p = d.body.appendChild(d.createElement("p"));
      const a = p.appendChild(d.createTextNode("ab"));
      const b = p.appendChild(d.createTextNode("cd"));
      const range = d.createRange();
      range.setStart(b, 1);
      range.setEnd(p, 2);
      p.normalize();
      return {
        start: [describeNode(range.startContainer), range.startOffset],
        end: [describeNode(range.endContainer), range.endOffset],
        a: a.data,
        bDetached: b.parentNode === null,
      };
    },
    {
      jsdomFix: {
        fix: (o) => ({ ...o, start: ['#text("abcd")', 3] }),
        spec: "https://dom.spec.whatwg.org/#dom-node-normalize",
        reason:
          "step 6.1 moves a range starting in a merged Text node to the survivor (offset + length); jsdom leaves it to the removal steps, ending at (p, 1)",
      },
    },
  );

  differential(
    "a single CharacterData record per merge: normalize queues replaceData on the survivor and child-list removals",
    (w) => {
      const d = w.document;
      const p = d.createElement("p");
      p.append("a", "b", "");
      const mo = new w.MutationObserver(() => {});
      mo.observe(p, { childList: true, characterData: true, subtree: true });
      p.normalize();
      return mo.takeRecords().map((r: AnyWindow) => [r.type, describeNode(r.target), r.removedNodes.length]);
    },
  );
});

describe("textContent — https://dom.spec.whatwg.org/#concept-descendant-text-content", () => {
  differential(
    "getter: concatenation of Text descendants in tree order (comments and PIs excluded); null for documents and doctypes",
    (w) => {
      const d = w.document;
      const div = d.createElement("div");
      div.innerHTML = "a<!--c--><b>b<i>c</i></b>d";
      div.appendChild(d.createProcessingInstruction("pi", "data"));
      return {
        div: div.textContent,
        document: d.textContent,
        doctype: d.doctype?.textContent ?? null,
        comment: div.childNodes[1].textContent,
      };
    },
  );

  differential(
    "setter: string replace all — one Text node, or no children for the empty string (https://dom.spec.whatwg.org/#string-replace-all)",
    (w) => {
      const d = w.document;
      const div = d.createElement("div");
      div.innerHTML = "<b>x</b>y";
      const mo = new w.MutationObserver(() => {});
      mo.observe(div, { childList: true });
      div.textContent = "new";
      const afterSet = [div.childNodes.length, div.firstChild.nodeType];
      div.textContent = "";
      const records = mo.takeRecords().map((r: AnyWindow) => [r.addedNodes.length, r.removedNodes.length]);
      div.textContent = null;
      return { afterSet, emptyChildren: div.childNodes.length, records };
    },
  );
});

describe("Text — https://dom.spec.whatwg.org/#interface-text", () => {
  differential(
    "constructor: new Text(data) has the current global's document as node document (https://dom.spec.whatwg.org/#dom-text-text)",
    (w) => {
      const t = new w.Text("hi");
      const empty = new w.Text();
      return { data: t.data, doc: t.ownerDocument === w.document, empty: empty.data, comment: new w.Comment("c").data };
    },
  );

  differential(
    "splitText: steps 5–7 new node gets the tail and is inserted after; ranges move (https://dom.spec.whatwg.org/#concept-text-split)",
    (w) => {
      const d = w.document;
      const p = d.body.appendChild(d.createElement("p"));
      const t = p.appendChild(d.createTextNode("hello world"));
      const range = d.createRange();
      range.setStart(t, 8);
      range.setEnd(p, 1);
      const tail = t.splitText(5);
      return {
        head: t.data,
        tail: tail.data,
        order: [...p.childNodes].map((n: AnyWindow) => n.data),
        start: [range.startContainer === tail, range.startOffset],
        end: [describeNode(range.endContainer), range.endOffset],
      };
    },
  );

  differential(
    "splitText: step 2 offset > length throws IndexSizeError; a detached Text splits without inserting",
    (w) => {
      const t = w.document.createTextNode("abc");
      let error = "";
      try {
        t.splitText(4);
      } catch (e) {
        error = (e as Error).name;
      }
      const tail = t.splitText(1);
      return { error, head: t.data, tail: tail.data, tailParent: tail.parentNode };
    },
  );

  differential(
    "wholeText: the data of the contiguous Text nodes around this one; elements and comments end the run (https://dom.spec.whatwg.org/#dom-text-wholetext)",
    (w) => {
      const d = w.document;
      const p = d.createElement("p");
      p.append("a", "b", d.createElement("i"), "c", d.createComment("x"), "d");
      return [...p.childNodes].map((n: AnyWindow) => (n.nodeType === 3 ? n.wholeText : null));
    },
  );
});

describe("CharacterData — https://dom.spec.whatwg.org/#interface-characterdata", () => {
  differential(
    "replace data steps 1–3: offset > length throws; count clamps to the end (https://dom.spec.whatwg.org/#concept-cd-replace)",
    (w) => {
      const t = w.document.createTextNode("abcdef");
      const out: unknown[] = [];
      const run = (f: () => unknown) => {
        try {
          out.push(f());
        } catch (e) {
          out.push((e as Error).name);
        }
      };
      run(() => t.substringData(2, 100));
      run(() => t.substringData(7, 1));
      run(() => (t.replaceData(1, 2, "XY_"), t.data));
      run(() => (t.insertData(0, ">"), t.data));
      run(() => (t.deleteData(5, 100), t.data));
      run(() => (t.appendData("!"), t.data));
      run(() => t.insertData(99, "x"));
      run(() => t.length);
      return out;
    },
  );

  differential("replace data steps 8–11: live range boundaries inside, after and before the replaced span", (w) => {
    const d = w.document;
    const t = d.body.appendChild(d.createTextNode("0123456789"));
    const ranges = [
      [1, 2],
      [3, 5],
      [7, 9],
    ].map(([s, e]) => {
      const r = d.createRange();
      r.setStart(t, s);
      r.setEnd(t, e);
      return r;
    });
    t.replaceData(3, 3, "ab"); // replaces "345" with "ab"
    return ranges.map((r) => [r.startOffset, r.endOffset]);
  });

  differential(
    "data setter queues a characterData record with the old value; nodeValue and textContent alias data",
    (w) => {
      const d = w.document;
      const c = d.createComment("old");
      const mo = new w.MutationObserver(() => {});
      mo.observe(c, { characterData: true, characterDataOldValue: true });
      c.data = "a";
      c.nodeValue = "b";
      c.textContent = "c";
      c.data = null;
      return { records: mo.takeRecords().map((r: AnyWindow) => [r.type, r.oldValue]), data: c.data };
    },
  );
});

describe("node length — https://dom.spec.whatwg.org/#concept-node-length", () => {
  differential(
    "CharacterData: its data length; other nodes: their child count (observed through Range bounds; a doctype is rejected by set-a-boundary-point step 1)",
    (w) => {
      const d = w.document;
      const r = d.createRange();
      const probe = (node: AnyWindow, offset: number) => {
        try {
          r.setStart(node, offset);
          return "ok";
        } catch (e) {
          return (e as Error).name;
        }
      };
      const el = d.createElement("div");
      el.append("a", "b");
      return {
        textEnd: probe(d.createTextNode("abc"), 3),
        textPast: probe(d.createTextNode("abc"), 4),
        elementEnd: probe(el, 2),
        elementPast: probe(el, 3),
        comment: probe(d.createComment("xy"), 2),
        doctype: d.doctype ? probe(d.doctype, 0) : "no doctype",
      };
    },
  );
});

describe("clone a node: document base URL override — https://dom.spec.whatwg.org/#document-base-url-override", () => {
  test("concept-node-clone step 2.1: a cloned document keeps the original's base URL even without its <base> element", () => {
    const window = createWindow({ url: "https://example.com/dir/page.html" });
    const original = window.document;
    original.head!.innerHTML = '<base href="/assets/">';
    expect(original.baseURI).toBe("https://example.com/assets/");
    const shallow = original.cloneNode(false) as Document;
    expect(shallow.firstChild).toBeNull();
    expect(shallow.URL).toBe("https://example.com/dir/page.html");
    expect(shallow.baseURI).toBe("https://example.com/assets/");
    // A <base> in the clone still wins over the override (document base URL step 1).
    const deep = original.cloneNode(true) as Document;
    deep.querySelector("base")!.setAttribute("href", "/elsewhere/");
    expect(deep.baseURI).toBe("https://example.com/elsewhere/");
  });
});
