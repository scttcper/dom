/**
 * TreeWalker, NodeIterator and NodeFilter, differential against jsdom. Focus-trap and roving
 * tabindex libraries (focus-trap, tabbable, React Aria's FocusScope) walk the tree with
 * createTreeWalker and a filter that SKIPs or REJECTs subtrees.
 *
 * Spec: DOM Standard §6 "Traversal"
 *   - filter: https://dom.spec.whatwg.org/#concept-node-filter
 *   - document.createTreeWalker: https://dom.spec.whatwg.org/#dom-document-createtreewalker
 *   - TreeWalker parentNode / traverse children / traverse siblings / previousNode / nextNode:
 *     https://dom.spec.whatwg.org/#dom-treewalker-parentnode, https://dom.spec.whatwg.org/#concept-traverse-children,
 *     https://dom.spec.whatwg.org/#concept-traverse-siblings, https://dom.spec.whatwg.org/#dom-treewalker-previousnode,
 *     https://dom.spec.whatwg.org/#dom-treewalker-nextnode
 *   - NodeIterator traverse, reference, pointer before reference, pre-removing steps:
 *     https://dom.spec.whatwg.org/#nodeiterator-pointer-before-reference,
 *     https://dom.spec.whatwg.org/#concept-nodeiterator-traverse
 */
import { describe } from "vitest";
import { describeNode, differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

// root ─ a ─ a1, a2(text)
//      ├ skip ─ s1
//      ├ reject ─ r1
//      └ c
const BODY =
  '<div id="root"><p id="a"><i id="a1"></i>a2</p><section id="skip"><b id="s1"></b></section><section id="reject"><b id="r1"></b></section><p id="c"></p></div>';

function setup(w: AnyWindow) {
  w.document.body.innerHTML = BODY;
  return w.document.getElementById("root");
}

/** Accept everything except #skip (SKIP: its children are still visited) and #reject (REJECT: subtree pruned). */
const filterFor = (w: AnyWindow) => (node: AnyWindow) =>
  node.id === "skip"
    ? w.NodeFilter.FILTER_SKIP
    : node.id === "reject"
      ? w.NodeFilter.FILTER_REJECT
      : w.NodeFilter.FILTER_ACCEPT;

const walk = (step: () => AnyWindow) => {
  const out: string[] = [];
  for (let n = step(); n; n = step()) out.push(describeNode(n));
  return out;
};

const tryName = (f: () => unknown) => {
  try {
    return f();
  } catch (e) {
    return `throws ${(e as Error).name}`;
  }
};

describe("filter — https://dom.spec.whatwg.org/#concept-node-filter", () => {
  differential("steps 3–4: whatToShow is checked first, so the callback never sees nodes it hides", (w) => {
    const root = setup(w);
    const seen: string[] = [];
    const tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_TEXT, (n: AnyWindow) => {
      seen.push(describeNode(n));
      return w.NodeFilter.FILTER_ACCEPT;
    });
    return { walked: walk(() => tw.nextNode()), seen };
  });

  differential(
    "steps 7–8: a filter object's acceptNode is called with the object as this; a callable filter is called directly",
    (w) => {
      const root = setup(w);
      const filter = {
        calls: 0,
        acceptNode(this: { calls: number }) {
          this.calls++;
          return 1;
        },
      };
      const tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, filter);
      walk(() => tw.nextNode());
      return {
        calls: filter.calls,
        filterIsSame: tw.filter === filter,
        whatToShow: tw.whatToShow,
        root: describeNode(tw.root),
      };
    },
  );

  differential(
    "step 2 and 9: the active flag makes re-entrant traversal throw InvalidStateError, and is cleared after an exception",
    (w) => {
      const root = setup(w);
      let inner: unknown = null;
      let tw: AnyWindow;
      tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, () => {
        if (inner === null) inner = tryName(() => tw.nextNode());
        return w.NodeFilter.FILTER_ACCEPT;
      });
      tw.nextNode();
      const boom = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, () => {
        throw new Error("boom");
      });
      const message = (f: () => unknown) => {
        try {
          return f();
        } catch (e) {
          return (e as Error).message;
        }
      };
      // Rethrown as is both times: the second call is not an InvalidStateError.
      const thrown = message(() => boom.nextNode());
      const thrownAgain = message(() => boom.nextNode());
      return { inner, thrown, thrownAgain };
    },
  );

  differential("whatToShow is an unsigned long: SHOW_ALL is 0xFFFFFFFF and -1 converts to it", (w) => {
    const root = setup(w);
    return [
      w.document.createTreeWalker(root).whatToShow,
      w.document.createTreeWalker(root, -1).whatToShow,
      w.document.createNodeIterator(root, 2 ** 32 + 1).whatToShow,
    ];
  });
});

describe("TreeWalker — https://dom.spec.whatwg.org/#interface-treewalker", () => {
  differential(
    "nextNode: preorder; SKIP descends into the node's children, REJECT prunes the subtree (https://dom.spec.whatwg.org/#dom-treewalker-nextnode)",
    (w) => {
      const root = setup(w);
      const tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, filterFor(w));
      return walk(() => tw.nextNode());
    },
  );

  differential(
    "previousNode: reverse preorder down to (but never past) the root (https://dom.spec.whatwg.org/#dom-treewalker-previousnode)",
    (w) => {
      const root = setup(w);
      const tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, filterFor(w));
      tw.currentNode = w.document.getElementById("c");
      return walk(() => tw.previousNode());
    },
  );

  differential(
    "parentNode: the nearest accepted ancestor inside root; never above root (https://dom.spec.whatwg.org/#dom-treewalker-parentnode)",
    (w) => {
      const root = setup(w);
      const tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, filterFor(w));
      tw.currentNode = w.document.getElementById("s1");
      return walk(() => tw.parentNode());
    },
  );

  differential(
    "firstChild / lastChild: SKIP is transparent, REJECT is not entered (https://dom.spec.whatwg.org/#concept-traverse-children)",
    (w) => {
      const root = setup(w);
      const tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, (n: AnyWindow) =>
        n.id === "a" || n.id === "c" ? w.NodeFilter.FILTER_SKIP : n.id === "reject" ? w.NodeFilter.FILTER_REJECT : 1,
      );
      const first = describeNode(tw.firstChild());
      tw.currentNode = root;
      const last = describeNode(tw.lastChild());
      tw.currentNode = w.document.getElementById("r1");
      const fromRejected = describeNode(tw.firstChild());
      return { first, last, fromRejected, current: describeNode(tw.currentNode) };
    },
  );

  differential(
    "nextSibling / previousSibling: step through SKIPped siblings' children, stop at root (https://dom.spec.whatwg.org/#concept-traverse-siblings)",
    (w) => {
      const root = setup(w);
      const tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, filterFor(w));
      tw.currentNode = w.document.getElementById("a");
      const forward = walk(() => tw.nextSibling());
      const back = walk(() => tw.previousSibling());
      tw.currentNode = root;
      return { forward, back, rootSibling: tw.nextSibling() };
    },
  );

  differential("currentNode can be set anywhere, even outside root; traversal then continues from there", (w) => {
    const root = setup(w);
    const tw = w.document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT);
    tw.currentNode = w.document.body;
    const fromOutside = describeNode(tw.nextNode());
    return { fromOutside, setNull: tryName(() => (tw.currentNode = null)) };
  });
});

describe("NodeIterator — https://dom.spec.whatwg.org/#concept-nodeiterator-traverse", () => {
  differential(
    "nextNode / previousNode move the reference and pointerBeforeReference flag; REJECT behaves like SKIP (https://dom.spec.whatwg.org/#nodeiterator-reference)",
    (w) => {
      const root = setup(w);
      const it = w.document.createNodeIterator(root, w.NodeFilter.SHOW_ELEMENT, filterFor(w));
      const state = () => [describeNode(it.referenceNode), it.pointerBeforeReferenceNode];
      const initial = state();
      const forward = walk(() => it.nextNode());
      const atEnd = state();
      const back = walk(() => it.previousNode());
      return { initial, forward, atEnd, back, end: state() };
    },
  );

  differential(
    "pre-removing steps: removing the reference node moves it to the next node when the pointer is before it (https://dom.spec.whatwg.org/#nodeiterator-pre-removing-steps)",
    (w) => {
      const root = setup(w);
      const it = w.document.createNodeIterator(root, w.NodeFilter.SHOW_ELEMENT);
      it.nextNode();
      it.nextNode(); // reference #a, pointer after
      it.previousNode(); // reference #a, pointer before
      w.document.getElementById("a").remove();
      return [describeNode(it.referenceNode), it.pointerBeforeReferenceNode, describeNode(it.nextNode())];
    },
  );

  differential(
    "pre-removing steps: with the pointer after the reference, removal moves it to the preceding node",
    (w) => {
      const root = setup(w);
      const it = w.document.createNodeIterator(root, w.NodeFilter.SHOW_ELEMENT);
      it.nextNode();
      it.nextNode();
      it.nextNode(); // reference #a1
      w.document.getElementById("a").remove();
      return [describeNode(it.referenceNode), it.pointerBeforeReferenceNode, describeNode(it.nextNode())];
    },
  );

  differential("pre-removing steps 1–2: removing the root or a node outside it leaves the iterator alone", (w) => {
    const root = setup(w);
    const it = w.document.createNodeIterator(w.document.getElementById("a"), w.NodeFilter.SHOW_ELEMENT);
    it.nextNode();
    it.nextNode();
    w.document.getElementById("c").remove();
    root.remove();
    return [describeNode(it.referenceNode), it.pointerBeforeReferenceNode];
  });

  differential(
    "detach does nothing: the iterator keeps working afterwards (https://dom.spec.whatwg.org/#dom-nodeiterator-detach)",
    (w) => {
      const root = setup(w);
      const it = w.document.createNodeIterator(root, w.NodeFilter.SHOW_ELEMENT);
      it.detach();
      return walk(() => it.nextNode());
    },
  );

  differential(
    "createNodeIterator / createTreeWalker defaults: SHOW_ALL and a null filter (https://dom.spec.whatwg.org/#dom-document-createnodeiterator)",
    (w) => {
      const root = setup(w);
      const it = w.document.createNodeIterator(root);
      const tw = w.document.createTreeWalker(root);
      return {
        it: [it.whatToShow, it.filter, describeNode(it.root)],
        tw: [tw.whatToShow, tw.filter, describeNode(tw.currentNode)],
        count: walk(() => it.nextNode()).length,
        missing: tryName(() => (w.document.createTreeWalker as AnyWindow).call(w.document)),
      };
    },
  );
});
