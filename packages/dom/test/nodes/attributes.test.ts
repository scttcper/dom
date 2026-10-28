/**
 * Attributes: the attribute-list algorithms, Attr nodes, NamedNodeMap, and the name validation
 * the factories run. Differential against jsdom where its behavior is current; the 2025 name
 * validation rules are asserted against the spec directly.
 *
 * Spec: DOM Standard §4.9 "Interface Element", §4.9.2 "Interface NamedNodeMap", §4.9.3 "Interface Attr", §1.6 namespaces
 *   - handle attribute changes: https://dom.spec.whatwg.org/#handle-attribute-changes
 *   - change / append / remove / replace an attribute: https://dom.spec.whatwg.org/#concept-element-attributes-change
 *   - get an attribute by name / by namespace: https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name
 *   - set an attribute / set an attribute value: https://dom.spec.whatwg.org/#concept-element-attributes-set
 *   - set an existing attribute value: https://dom.spec.whatwg.org/#set-an-existing-attribute-value
 *   - valid names: https://dom.spec.whatwg.org/#valid-element-local-name
 *   - remove an attribute: https://dom.spec.whatwg.org/#concept-element-attributes-remove
 *   - setAttributeNode / removeAttributeNode / getAttributeNodeNS: https://dom.spec.whatwg.org/#dom-element-setattributenode,
 *     https://dom.spec.whatwg.org/#dom-element-removeattributenode, https://dom.spec.whatwg.org/#dom-element-getattributenodens
 *   - NamedNodeMap getNamedItem: https://dom.spec.whatwg.org/#dom-namednodemap-getnameditem
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@ctrl/dom";
import {
  $impl,
  F_ARIA_ATTRS,
  F_CONTENTEDITABLE_ATTR,
  F_DATA_ATTRS,
  F_INERT_ATTR,
  F_TABINDEX_ATTR,
} from "@ctrl/dom/internal";
import { differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

/** Attribute records of `mo` as [attributeName, attributeNamespace, oldValue]. */
const attrRecords = (mo: AnyWindow) =>
  mo.takeRecords().map((r: AnyWindow) => [r.attributeName, r.attributeNamespace, r.oldValue]);

function watch(w: AnyWindow, el: AnyWindow) {
  const mo = new w.MutationObserver(() => {});
  mo.observe(el, { attributes: true, attributeOldValue: true });
  return mo;
}

const list = (el: AnyWindow) =>
  [...el.attributes].map((a: AnyWindow) => `${a.namespaceURI ?? ""}|${a.name}=${a.value}`);

const tryName = (f: () => unknown) => {
  try {
    return f();
  } catch (e) {
    return `throws ${(e as Error).name}`;
  }
};

describe("attribute list algorithms — https://dom.spec.whatwg.org/#concept-element-attributes-change", () => {
  differential("reusing a qualified name respects each element's namespace and its document after adoption", (w) => {
    const d = w.document;
    const html = d.createElement("div");
    const svg = d.createElementNS("http://www.w3.org/2000/svg", "svg");
    const xml = d.implementation.createDocument(null, "root", null);
    const mo = watch(w, html);
    html.setAttribute("DATA-Ç", "html");
    svg.setAttribute("DATA-Ç", "svg");
    xml.adoptNode(html);
    html.setAttribute("DATA-Ç", "xml");
    d.adoptNode(html);
    html.setAttribute("DATA-Ç", "html-again");
    html.setAttribute("DATA-Ç", "html-again");
    return { html: list(html), svg: list(svg), records: attrRecords(mo) };
  });

  differential(
    "append adds at the end; change keeps the position; remove closes the gap (https://dom.spec.whatwg.org/#concept-element-attributes-append)",
    (w) => {
      const el = w.document.createElement("div");
      const mo = watch(w, el);
      el.setAttribute("a", "1");
      el.setAttribute("b", "2");
      el.setAttribute("c", "3");
      el.setAttribute("a", "changed");
      el.removeAttribute("b");
      el.removeAttribute("missing");
      return { list: list(el), records: attrRecords(mo) };
    },
  );

  differential(
    "handle attribute changes queues a record even when the value is unchanged (https://dom.spec.whatwg.org/#handle-attribute-changes)",
    (w) => {
      const el = w.document.createElement("div");
      el.setAttribute("a", "same");
      const mo = watch(w, el);
      el.setAttribute("a", "same");
      el.id = el.id; // reflects through set an attribute value (https://dom.spec.whatwg.org/#concept-element-attributes-set-value)
      return attrRecords(mo);
    },
  );

  differential(
    "replace: setAttributeNode with a same-named Attr swaps nodes at the same index and returns the old one (https://dom.spec.whatwg.org/#concept-element-attributes-replace)",
    (w) => {
      const d = w.document;
      const el = d.createElement("div");
      el.setAttribute("a", "1");
      el.setAttribute("b", "2");
      const old = el.getAttributeNode("a");
      const fresh = d.createAttribute("a");
      fresh.value = "new";
      const mo = watch(w, el);
      const returned = el.setAttributeNode(fresh);
      return {
        list: list(el),
        returnedOld: returned === old,
        oldOwner: old.ownerElement,
        freshOwner: fresh.ownerElement === el,
        records: attrRecords(mo),
        sameAgain: el.setAttributeNode(fresh) === fresh,
      };
    },
  );

  differential(
    "set an attribute step 2: an Attr owned by another element throws InUseAttributeError (https://dom.spec.whatwg.org/#concept-element-attributes-set)",
    (w) => {
      const d = w.document;
      const a = d.createElement("div");
      const b = d.createElement("div");
      a.setAttribute("x", "1");
      return { error: tryName(() => b.setAttributeNode(a.getAttributeNode("x"))), bHas: b.hasAttribute("x") };
    },
  );

  differential(
    "removeAttributeNode: NotFoundError for an Attr of another element; the removed Attr keeps its value but loses its owner",
    (w) => {
      const d = w.document;
      const el = d.createElement("div");
      el.setAttribute("x", "1");
      const attr = el.getAttributeNode("x");
      const other = d.createAttribute("x");
      const error = tryName(() => el.removeAttributeNode(other));
      const removed = el.removeAttributeNode(attr);
      return { error, same: removed === attr, owner: attr.ownerElement, value: attr.value, has: el.hasAttribute("x") };
    },
  );
});

describe("get an attribute — https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name", () => {
  differential(
    "by name: HTML elements in HTML documents lowercase the qualified name first; the first match in list order wins",
    (w) => {
      const d = w.document;
      const el = d.createElement("div");
      el.setAttributeNS("urn:a", "p:Foo", "ns-first");
      el.setAttribute("p:foo", "plain");
      const svg = d.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 1 1");
      return {
        lower: el.getAttribute("P:FOO"),
        // "p:Foo" is not lowercased in the list, so only the setAttribute one (stored as "p:foo") matches.
        exact: el.getAttribute("p:Foo"),
        svgCase: [svg.getAttribute("viewBox"), svg.getAttribute("viewbox")],
        names: el.getAttributeNames(),
        // setAttribute step 4 changes the first attribute whose qualified name matches, whatever its namespace.
        firstMatch: (() => {
          const other = d.createElement("div");
          other.setAttributeNS("urn:b", "p:foo", "ns");
          other.setAttribute("p:foo", "plain");
          return list(other);
        })(),
      };
    },
  );

  differential(
    "by namespace: null and empty namespace are the same; local name match is exact (https://dom.spec.whatwg.org/#concept-element-attributes-get-by-namespace)",
    (w) => {
      const el = w.document.createElement("div");
      el.setAttributeNS("urn:a", "p:x", "a");
      el.setAttributeNS("", "x", "none");
      el.setAttributeNS("urn:a", "q:x", "replaced");
      return {
        a: el.getAttributeNS("urn:a", "x"),
        none: [el.getAttributeNS(null, "x"), el.getAttributeNS("", "x")],
        prefixKept: el.getAttributeNodeNS("urn:a", "x").prefix,
        upper: el.getAttributeNS("urn:a", "X"),
        has: [el.hasAttributeNS("urn:a", "x"), el.hasAttributeNS("urn:b", "x")],
        count: el.attributes.length,
      };
    },
  );

  differential(
    "getAttributeNode / getAttributeNodeNS return the same Attr object every time (https://dom.spec.whatwg.org/#dom-element-getattributenode)",
    (w) => {
      const el = w.document.createElement("div");
      el.setAttribute("a", "1");
      el.setAttributeNS("urn:x", "x:b", "2");
      const a = el.getAttributeNode("a");
      return {
        same: a === el.getAttributeNode("A") && a === el.attributes[0] && a === el.attributes.getNamedItem("a"),
        ns: el.getAttributeNodeNS("urn:x", "b") === el.attributes[1],
        missing: [el.getAttributeNode("zz"), el.getAttributeNodeNS(null, "b")],
        fields: [a.name, a.localName, a.prefix, a.namespaceURI, a.ownerElement === el, a.specified],
      };
    },
  );
});

describe("toggleAttribute — https://dom.spec.whatwg.org/#dom-element-toggleattribute", () => {
  differential(
    "steps 4–5: adds an empty attribute unless force is false; removes unless force is true; returns presence",
    (w) => {
      const el = w.document.createElement("div");
      const mo = watch(w, el);
      const results = [
        el.toggleAttribute("Hidden"),
        el.getAttribute("hidden"),
        el.toggleAttribute("hidden", true),
        el.toggleAttribute("hidden"),
        el.toggleAttribute("hidden", false),
        el.toggleAttribute("hidden", true),
      ];
      return { results, records: attrRecords(mo), invalid: tryName(() => el.toggleAttribute("a b")) };
    },
  );
});

describe("Attr value — https://dom.spec.whatwg.org/#dom-attr-value", () => {
  differential(
    "setting value on an owned Attr runs change an attribute (record with old value); on an unowned Attr just stores it (https://dom.spec.whatwg.org/#set-an-existing-attribute-value)",
    (w) => {
      // An Attr's value is its attribute's while attached, its own otherwise: https://dom.spec.whatwg.org/#concept-attribute-value
      const d = w.document;
      const el = d.createElement("div");
      el.setAttribute("title", "old");
      const attr = el.getAttributeNode("title");
      const mo = watch(w, el);
      attr.value = "new";
      attr.nodeValue = "newer";
      attr.textContent = "newest";
      const loose = d.createAttribute("x");
      loose.value = "v";
      return {
        el: el.getAttribute("title"),
        title: el.title,
        records: attrRecords(mo),
        loose: [loose.value, loose.nodeValue, loose.textContent, loose.ownerElement],
      };
    },
  );

  differential(
    "Attr nodes are not children: no parent, no children, and setting textContent does not create Text nodes",
    (w) => {
      const d = w.document;
      const attr = d.createAttribute("a");
      attr.textContent = "x";
      return [
        attr.parentNode,
        attr.childNodes.length,
        attr.firstChild,
        attr.hasChildNodes(),
        attr.nodeType,
        attr.nodeName,
      ];
    },
  );
});

describe("NamedNodeMap — https://dom.spec.whatwg.org/#interface-namednodemap", () => {
  differential(
    "item / getNamedItem / getNamedItemNS read the live attribute list (https://dom.spec.whatwg.org/#dom-namednodemap-item)",
    (w) => {
      const el = w.document.createElement("div");
      const map = el.attributes;
      el.setAttribute("a", "1");
      el.setAttributeNS("urn:x", "x:b", "2");
      const out = [
        map.length,
        map.item(0).name,
        map.item(1).name,
        map.item(2),
        map.item(-1 as never),
        map.getNamedItem("x:b").value,
        map.getNamedItemNS("urn:x", "b").value,
        map.getNamedItem("nope"),
      ];
      el.removeAttribute("a");
      return [...out, map.length, map.item(0).name];
    },
  );

  differential(
    "removeNamedItem / removeNamedItemNS remove and return the Attr; NotFoundError when absent (https://dom.spec.whatwg.org/#dom-namednodemap-removenameditem)",
    (w) => {
      const el = w.document.createElement("div");
      el.setAttribute("a", "1");
      el.setAttributeNS("urn:x", "x:b", "2");
      const map = el.attributes;
      const a = map.removeNamedItem("A");
      const b = map.removeNamedItemNS("urn:x", "b");
      return {
        a: [a.name, a.ownerElement],
        b: [b.name, b.value],
        left: map.length,
        missing: tryName(() => map.removeNamedItem("a")),
        missingNS: tryName(() => map.removeNamedItemNS("urn:x", "b")),
      };
    },
  );

  differential("setNamedItem / setNamedItemNS are setAttributeNode", (w) => {
    const d = w.document;
    const el = d.createElement("div");
    const attr = d.createAttributeNS("urn:x", "x:a");
    attr.value = "1";
    const first = el.attributes.setNamedItemNS(attr);
    const plain = d.createAttribute("b");
    el.attributes.setNamedItem(plain);
    return { first, list: list(el), owner: attr.ownerElement === el };
  });
});

describe("valid names — https://dom.spec.whatwg.org/#valid-element-local-name", () => {
  const throws = (f: () => unknown) => {
    try {
      f();
      return false;
    } catch (e) {
      expect((e as Error).name).toBe("InvalidCharacterError");
      return true;
    }
  };

  test("element local names: an ASCII alpha start allows anything but whitespace, NULL, / and >", () => {
    for (const ok of ["a", "my-element", "a.b", "a:b", "aé", "a!@#$%", "A[1]", "a=b"])
      expect(
        throws(() => document.createElement(ok)),
        ok,
      ).toBe(false);
    for (const bad of ["", "a b", "a\tb", "a/b", "a>b", "a\0b"])
      expect(
        throws(() => document.createElement(bad)),
        JSON.stringify(bad),
      ).toBe(true);
  });

  test("element local names: other starts must be :, _ or ≥ U+0080, followed by alphanumerics, -, ., :, _ or ≥ U+0080", () => {
    for (const ok of ["_a", ":a", "élément", "_a-b.c:d", "\u{1F600}x"])
      expect(
        throws(() => document.createElement(ok)),
        ok,
      ).toBe(false);
    for (const bad of ["1a", "-a", ".a", "_a!", "_a b", "é=x"])
      expect(
        throws(() => document.createElement(bad)),
        bad,
      ).toBe(true);
  });

  test("attribute local names: at least one code point and none of whitespace, NULL, /, = or > (https://dom.spec.whatwg.org/#valid-attribute-local-name)", () => {
    const el = document.createElement("div");
    for (const ok of ["1", "-", "@click", "[x]", "aé", ":", "(event)"])
      expect(
        throws(() => el.setAttribute(ok, "")),
        ok,
      ).toBe(false);
    for (const bad of ["", "a b", "a/b", "a=b", "a>b", "a\0"])
      expect(
        throws(() => el.setAttribute(bad, "")),
        JSON.stringify(bad),
      ).toBe(true);
    expect(throws(() => document.createAttribute("@x"))).toBe(false);
    expect(throws(() => document.createAttribute("a=b"))).toBe(true);
  });

  test("namespace prefixes: at least one code point and none of whitespace, NULL, / or > (https://dom.spec.whatwg.org/#valid-namespace-prefix)", () => {
    expect(throws(() => document.createElementNS("urn:x", "1:a"))).toBe(false);
    expect(document.createElementNS("urn:x", "@p:a").prefix).toBe("@p");
    for (const bad of [":a", "a/b:c", "a>b:c", "a b:c"])
      expect(
        throws(() => document.createElementNS("urn:x", bad)),
        bad,
      ).toBe(true);
  });

  test("doctype names: anything without whitespace, NULL or > — including the empty string (https://dom.spec.whatwg.org/#valid-doctype-name)", () => {
    for (const ok of ["", "html", "1", "a:b:c", "<x"])
      expect(
        throws(() => document.implementation.createDocumentType(ok, "", "")),
        JSON.stringify(ok),
      ).toBe(false);
    for (const bad of ["a b", "a>", "a\0"])
      expect(
        throws(() => document.implementation.createDocumentType(bad, "", "")),
        JSON.stringify(bad),
      ).toBe(true);
  });
});

describe("attribute name flags (ours) — https://dom.spec.whatwg.org/#concept-element-attributes-append", () => {
  // F_ARIA_ATTRS / F_DATA_ATTRS let lookups of aria-* / data-* names skip elements without one:
  // a flag that is missing while such an attribute exists would hide it from those lookups.
  const flags = (el: unknown) => {
    const impl = (el as Record<symbol, { flags: number }>)[$impl];
    return { aria: (impl.flags & F_ARIA_ATTRS) !== 0, data: (impl.flags & F_DATA_ATTRS) !== 0 };
  };

  test("set by the parser, setAttribute, setAttributeNS, toggleAttribute and setAttributeNode", () => {
    const host = document.createElement("div");
    host.innerHTML = '<span aria-label="x" data-testid="t"></span><b class="c"></b>';
    expect(flags(host.firstChild)).toEqual({ aria: true, data: true });
    expect(flags(host.lastChild)).toEqual({ aria: false, data: false });
    const a = document.createElement("i");
    a.setAttribute("ARIA-HIDDEN", "true");
    expect(flags(a)).toEqual({ aria: true, data: false });
    const b = document.createElement("i");
    b.setAttributeNS(null, "data-x", "1");
    expect(flags(b)).toEqual({ aria: false, data: true });
    const c = document.createElement("i");
    c.toggleAttribute("aria-busy");
    expect(flags(c)).toEqual({ aria: true, data: false });
    const d = document.createElement("i");
    const node = document.createAttribute("data-y");
    d.setAttributeNode(node);
    expect(flags(d)).toEqual({ aria: false, data: true });
  });

  test("kept while another attribute with the prefix remains, cleared with the last one", () => {
    const el = document.createElement("div");
    el.setAttribute("aria-label", "a");
    el.setAttribute("aria-describedby", "b");
    el.setAttribute("data-a", "1");
    el.removeAttribute("aria-label");
    expect(flags(el)).toEqual({ aria: true, data: true });
    el.removeAttributeNode(el.getAttributeNode("aria-describedby")!);
    expect(flags(el)).toEqual({ aria: false, data: true });
    el.toggleAttribute("data-a");
    expect(flags(el)).toEqual({ aria: false, data: false });
  });

  test("copied by cloneNode", () => {
    const el = document.createElement("div");
    el.setAttribute("aria-label", "a");
    el.setAttribute("data-a", "1");
    expect(flags(el.cloneNode(false))).toEqual({ aria: true, data: true });
  });

  // F_TABINDEX_ATTR / F_CONTENTEDITABLE_ATTR / F_INERT_ATTR let tabIndex, contentEditable and
  // inertness skip the attribute scan on elements without the attribute.
  const exact = (el: unknown) => {
    const impl = (el as Record<symbol, { flags: number }>)[$impl];
    return [F_TABINDEX_ATTR, F_CONTENTEDITABLE_ATTR, F_INERT_ATTR].map((f) => (impl.flags & f) !== 0);
  };

  test("tabindex, contenteditable and inert: set by every write path, cleared with the last one, cloned", () => {
    const host = document.createElement("div");
    host.innerHTML = '<span tabindex="2" contenteditable inert></span>';
    const parsed = host.firstChild as unknown as HTMLElementLike;
    expect(exact(parsed)).toEqual([true, true, true]);
    expect(exact(parsed.cloneNode(false))).toEqual([true, true, true]);
    const el = document.createElement("div") as unknown as HTMLElementLike;
    el.tabIndex = 3;
    el.setAttributeNS("urn:x", "x:tabindex", "1");
    el.toggleAttribute("inert");
    el.contentEditable = "true";
    expect(exact(el)).toEqual([true, true, true]);
    el.removeAttribute("tabindex");
    expect(exact(el)).toEqual([true, true, true]); // the urn:x one remains
    el.removeAttributeNS("urn:x", "tabindex");
    el.contentEditable = "inherit";
    el.toggleAttribute("inert");
    expect(exact(el)).toEqual([false, false, false]);
  });

  test("tabIndex, contentEditable and isContentEditable read the same with and without the attribute", () => {
    const el = document.createElement("div") as unknown as HTMLElementLike;
    expect([el.tabIndex, el.contentEditable, el.isContentEditable]).toEqual([-1, "inherit", false]);
    el.setAttribute("tabindex", "5");
    el.setAttribute("contenteditable", "");
    expect([el.tabIndex, el.contentEditable, el.isContentEditable]).toEqual([5, "true", true]);
    const button = document.createElement("button") as unknown as HTMLElementLike;
    expect(button.tabIndex).toBe(0);
  });
});

interface HTMLElementLike {
  tabIndex: number;
  contentEditable: string;
  readonly isContentEditable: boolean;
  cloneNode(deep: boolean): unknown;
  setAttribute(name: string, value: string): void;
  setAttributeNS(ns: string | null, name: string, value: string): void;
  removeAttribute(name: string): void;
  removeAttributeNS(ns: string | null, name: string): void;
  toggleAttribute(name: string): boolean;
}
