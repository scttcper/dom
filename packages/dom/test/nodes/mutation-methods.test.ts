/**
 * The ParentNode / ChildNode convenience methods and the mutation algorithms behind them that
 * tree.test.ts does not reach, differential against jsdom with mutation records as the
 * observation (React reconciles through insertBefore/appendChild/removeChild, libraries and
 * tests through append/replaceChildren/replaceWith).
 *
 * Spec: DOM Standard §4.2.3 "Mutation algorithms", §4.2.6 "Mixin ParentNode", §4.2.8 "Mixin ChildNode"
 *   - ensure pre-insertion validity: https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 *   - pre-insert / append: https://dom.spec.whatwg.org/#concept-node-pre-insert
 *     (append: https://dom.spec.whatwg.org/#concept-node-append)
 *   - replace all: https://dom.spec.whatwg.org/#concept-node-replace-all
 *   - converting nodes into a node: https://dom.spec.whatwg.org/#converting-nodes-into-a-node
 *   - ParentNode: https://dom.spec.whatwg.org/#interface-parentnode
 *   - ChildNode: https://dom.spec.whatwg.org/#interface-childnode
 *   - NonElementParentNode: https://dom.spec.whatwg.org/#interface-nonelementparentnode
 *   - host-including inclusive ancestor: https://dom.spec.whatwg.org/#concept-tree-host-including-inclusive-ancestor
 */
import { describe, expect, test } from "vitest";
import { createWindow, type Element } from "@rtd/dom";
import { describeNode, differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

/** Child-list records of `mo` as [target, added, removed, previousSibling, nextSibling]. */
function records(mo: AnyWindow) {
  const names = (list: AnyWindow) => [...list].map((n: AnyWindow) => describeNode(n)).join(",");
  return mo.takeRecords().map((r: AnyWindow) => [describeNode(r.target), names(r.addedNodes), names(r.removedNodes), describeNode(r.previousSibling), describeNode(r.nextSibling)]);
}

function observed(w: AnyWindow, target: AnyWindow) {
  const mo = new w.MutationObserver(() => {});
  mo.observe(target, { childList: true, subtree: true });
  return mo;
}

const tryName = (f: () => unknown) => {
  try {
    f();
    return "ok";
  } catch (e) {
    return (e as Error).name;
  }
};

describe("ensure pre-insertion validity — https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity", () => {
  differential("step 1: only documents, fragments and elements can be parents", (w) => {
    const d = w.document;
    return [d.createTextNode("t"), d.createComment("c"), d.createProcessingInstruction("p", "d"), d.doctype].map((parent) => tryName(() => parent.appendChild(d.createElement("i"))));
  });

  differential("step 2: host-including — a shadow host cannot be inserted into its own shadow tree", (w) => {
    const d = w.document;
    const host = d.body.appendChild(d.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const inner = root.appendChild(d.createElement("span"));
    return [tryName(() => root.appendChild(host)), tryName(() => inner.appendChild(d.body)), tryName(() => inner.appendChild(d.createElement("b")))];
  });

  differential("step 4: documents and attributes can never be inserted; doctypes only into documents", (w) => {
    const d = w.document;
    const div = d.createElement("div");
    const attr = d.createAttribute("a");
    const doctype = d.implementation.createDocumentType("x", "", "");
    return [tryName(() => div.appendChild(d)), tryName(() => div.appendChild(attr)), tryName(() => div.appendChild(doctype)), tryName(() => d.createDocumentFragment().appendChild(doctype))];
  });

  differential("step 6: into a document — fragments with two elements or text, a second doctype, an element before the doctype", (w) => {
    const d = w.document.implementation.createHTMLDocument("t");
    const twoElements = d.createDocumentFragment();
    twoElements.append(d.createElement("a"), d.createElement("b"));
    const withText = d.createDocumentFragment();
    withText.append("x");
    const empty = d.implementation.createDocument(null, null, null);
    const el = empty.appendChild(empty.createElement("root"));
    return {
      fragmentTwoElements: tryName(() => empty.replaceChild(twoElements, el)),
      fragmentText: tryName(() => empty.appendChild(withText)),
      secondDoctype: tryName(() => d.appendChild(d.implementation.createDocumentType("html", "", ""))),
      doctypeAfterElement: tryName(() => empty.appendChild(empty.implementation.createDocumentType("root", "", ""))),
      elementBeforeDoctype: tryName(() => d.insertBefore(d.createElement("x"), d.doctype)),
      commentBeforeDoctype: tryName(() => d.insertBefore(d.createComment("ok"), d.doctype)),
    };
  });
});

describe("pre-insert and append — https://dom.spec.whatwg.org/#concept-node-pre-insert", () => {
  differential("steps 3–4: inserting before the node itself uses its next sibling as the reference child", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const [a, b, c] = ["a", "b", "c"].map((t) => p.appendChild(d.createElement(t)));
    const mo = observed(w, p);
    p.insertBefore(b, b);
    return { order: [...p.childNodes].map((n: AnyWindow) => n.localName), records: records(mo), same: [a, b, c].every((n) => n.parentNode === p) };
  });

  differential("moving a node within the same parent queues a removal record then an insertion record", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const [a, , c] = ["a", "b", "c"].map((t) => p.appendChild(d.createElement(t)));
    const mo = observed(w, p);
    p.insertBefore(c, a);
    return records(mo);
  });

  differential("inserting a fragment queues one record on the fragment (removal) and one on the parent (all its children)", (w) => {
    const d = w.document;
    const frag = d.createDocumentFragment();
    frag.append(d.createElement("a"), "t", d.createElement("b"));
    const p = d.createElement("p");
    p.append(d.createElement("z"));
    const moFrag = observed(w, frag);
    const mo = observed(w, p);
    p.insertBefore(frag, p.firstChild);
    return { parent: records(mo), fragment: records(moFrag), children: [...p.childNodes].map((n: AnyWindow) => describeNode(n)) };
  });
});

describe("converting nodes into a node — https://dom.spec.whatwg.org/#converting-nodes-into-a-node", () => {
  differential("steps 1–3: strings become Text nodes; one argument is inserted itself, several through a fragment", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const mo = observed(w, p);
    p.append("one");
    p.append(d.createElement("b"), "two", 3 as never, null as never);
    return { children: [...p.childNodes].map((n: AnyWindow) => describeNode(n)), records: records(mo) };
  });

  differential("no arguments still runs the algorithm: append() and prepend() are no-ops without records", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    p.append("x");
    const mo = observed(w, p);
    p.append();
    p.prepend();
    return records(mo);
  });
});

describe("ParentNode — https://dom.spec.whatwg.org/#interface-parentnode", () => {
  differential("prepend inserts before the first child; append after the last (on elements, fragments and documents)", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    p.append("m");
    p.prepend("a", d.createElement("b"));
    p.append(d.createElement("y"), "z");
    const frag = d.createDocumentFragment();
    frag.prepend("2");
    frag.prepend("1");
    const doc = d.implementation.createDocument(null, null, null);
    doc.append(doc.createComment("c"));
    doc.prepend(doc.createElement("root"));
    return { p: [...p.childNodes].map((n: AnyWindow) => describeNode(n)), frag: frag.textContent, doc: [...doc.childNodes].map((n: AnyWindow) => describeNode(n)) };
  });

  differential("replaceChildren: validity is checked before anything is removed; one replace-all record (https://dom.spec.whatwg.org/#concept-node-replace-all)", (w) => {
    const d = w.document;
    const p = d.body.appendChild(d.createElement("p"));
    p.append(d.createElement("a"), d.createElement("b"));
    const mo = observed(w, p);
    const failed = tryName(() => p.replaceChildren(d.createElement("i"), d.body));
    const kept = p.childNodes.length;
    p.replaceChildren("x", d.createElement("y"));
    const afterReplace = records(mo);
    p.replaceChildren();
    return { failed, kept, afterReplace, cleared: records(mo), empty: p.childNodes.length };
  });

  differential("replaceChildren with the node's own child keeps it (removed from the old position, then reinserted)", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const [a, b] = [p.appendChild(d.createElement("a")), p.appendChild(d.createElement("b"))];
    const mo = observed(w, p);
    p.replaceChildren(b);
    return { children: [...p.childNodes].map((n: AnyWindow) => describeNode(n)), aParent: a.parentNode, records: records(mo) };
  });

  differential("children, firstElementChild, lastElementChild and childElementCount skip non-elements", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    p.append("t", d.createElement("a"), d.createComment("c"), d.createElement("b"), "u");
    return [p.children.length, p.childElementCount, describeNode(p.firstElementChild), describeNode(p.lastElementChild), describeNode(p.firstElementChild.nextElementSibling), describeNode(p.lastElementChild.previousElementSibling)];
  });
});

describe("ChildNode — https://dom.spec.whatwg.org/#interface-childnode", () => {
  differential("before: step 3 viable previous sibling skips siblings that are being moved", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const [a, b, c] = ["a", "b", "c"].map((t) => p.appendChild(d.createElement(t)));
    c.before(a, "t", b);
    return [...p.childNodes].map((n: AnyWindow) => describeNode(n));
  });

  differential("after: step 3 viable next sibling skips siblings that are being moved", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const [a, b, c] = ["a", "b", "c"].map((t) => p.appendChild(d.createElement(t)));
    a.after(b, "t", c);
    b.after(c, a);
    return [...p.childNodes].map((n: AnyWindow) => describeNode(n));
  });

  differential("replaceWith: replacing with nodes that include itself keeps it in place among them", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const [a, b, c] = ["a", "b", "c"].map((t) => p.appendChild(d.createElement(t)));
    b.replaceWith("x", b, "y");
    const middle = [...p.childNodes].map((n: AnyWindow) => describeNode(n));
    const mo = observed(w, p);
    c.replaceWith(a);
    return { middle, final: [...p.childNodes].map((n: AnyWindow) => describeNode(n)), records: records(mo) };
  });

  differential("before/after/replaceWith/remove on a parentless node do nothing (step 2)", (w) => {
    const d = w.document;
    const lone = d.createElement("i");
    const other = d.createElement("b");
    lone.before(other);
    lone.after("t");
    lone.replaceWith(other);
    lone.remove();
    return { other: other.parentNode, lone: lone.parentNode };
  });

  differential("remove() queues a record with the removed node's siblings", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const [, b] = ["a", "b", "c"].map((t) => p.appendChild(d.createElement(t)));
    const mo = observed(w, p);
    b.remove();
    return records(mo);
  });
});

describe("NonElementParentNode — https://dom.spec.whatwg.org/#interface-nonelementparentnode", () => {
  differential("getElementById on fragments and detached documents: first element in tree order with that ID", (w) => {
    const d = w.document;
    const frag = d.createDocumentFragment();
    frag.append(d.createElement("div"));
    frag.firstChild.innerHTML = '<span id="x">1</span><b id="x">2</b>';
    const doc = d.implementation.createHTMLDocument("t");
    doc.body.innerHTML = '<i id="y"></i>';
    return { frag: describeNode(frag.getElementById("x")), missing: frag.getElementById("nope"), empty: frag.getElementById(""), doc: describeNode(doc.getElementById("y")) };
  });

  test("a document's getElementById follows id changes, removal and duplicate ids in tree order", () => {
    const { document } = createWindow();
    document.body!.innerHTML = '<p id="a"></p><span id="a"></span>';
    const [p, span] = [document.body!.firstChild as Element, document.body!.lastChild as Element];
    expect(document.getElementById("a")).toBe(p);
    p.remove();
    expect(document.getElementById("a")).toBe(span);
    span.id = "b";
    expect(document.getElementById("a")).toBeNull();
    document.body!.prepend(p);
    span.setAttribute("id", "a");
    expect(document.getElementById("a")).toBe(p);
  });
});

describe("DocumentFragment host — https://dom.spec.whatwg.org/#concept-documentfragment-host", () => {
  differential("a shadow root's host is its element; a shadow root has no parent; a plain fragment has no host", (w) => {
    const d = w.document;
    const host = d.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const frag = d.createDocumentFragment();
    return { host: describeNode(root.host), parentOfRoot: root.parentNode, fragHost: "host" in frag ? frag.host : "absent" };
  });
});
