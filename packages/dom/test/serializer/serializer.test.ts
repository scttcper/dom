/**
 * Markup serialization and parsing entry points.
 *
 * Spec: HTML Standard §13.3 "Serializing HTML fragments"
 *   https://html.spec.whatwg.org/#serialising-html-fragments
 *   https://html.spec.whatwg.org/#escapingString
 *   https://html.spec.whatwg.org/#dom-element-gethtml
 * Spec: DOM Parsing and Serialization §3.2 "XML serialization"
 *   https://w3c.github.io/DOM-Parsing/#dfn-xml-serialization
 * Spec: HTML Standard §13.4 "Parsing HTML fragments" / XML fragment parsing / DOMParser
 *   https://html.spec.whatwg.org/#html-fragment-parsing-algorithm
 *   https://html.spec.whatwg.org/#xml-fragment-parsing-algorithm
 *   https://html.spec.whatwg.org/#dom-domparser-parsefromstring
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "../../src/index.ts";
import { Document } from "../../src/nodes/Document.ts";
import type { Element } from "../../src/nodes/Element.ts";
import { getHTML, serializeXML } from "../../src/serializer/index.ts";
import { parseDocument, parseFragment, parseXML, PARSERERROR_NS, setHTMLUnsafe } from "../../src/parser/index.ts";
import { $contentType, $impl } from "../../src/keys.ts";

let document: Document;

beforeEach(() => {
  document = createWindow().document as unknown as Document;
});

function div(html: string): Element {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("HTML fragment serialization — https://html.spec.whatwg.org/#serialising-html-fragments", () => {
  test("escaping a string: text escapes & < > and U+00A0", () => {
    expect(div("a &amp; &lt;b&gt; &nbsp;").innerHTML).toBe("a &amp; &lt;b&gt; &nbsp;");
  });

  test('escaping a string (attribute mode): & " < > and U+00A0 are escaped', () => {
    const el = document.createElement("p");
    el.setAttribute("title", `a&"<> '`);
    expect(el.outerHTML).toBe(`<p title="a&amp;&quot;&lt;&gt;&nbsp;'"></p>`);
  });

  test("elements that serialize as void get no end tag and no children", () => {
    expect(div("<br><img src=x><input><hr><wbr>").innerHTML).toBe('<br><img src="x"><input><hr><wbr>');
  });

  test("text in raw text parents (script, style, xmp, iframe, noembed, noframes, plaintext) is literal", () => {
    expect(div("<script>a < b && c</script><style>p > a {}</style>").innerHTML).toBe(
      "<script>a < b && c</script><style>p > a {}</style>",
    );
  });

  test("noscript text is escaped: scripting is disabled for the node", () => {
    const el = document.createElement("noscript");
    el.appendChild(document.createTextNode("<b>"));
    expect(el.innerHTML).toBe("&lt;b&gt;");
  });

  test("template elements serialize their template contents", () => {
    expect(div("<template><b>x</b></template>").innerHTML).toBe("<template><b>x</b></template>");
  });

  test("foreign elements use the local name; namespaced attributes use xlink:/xml:/xmlns: names", () => {
    expect(div('<svg viewBox="0 0 1 1"><use xlink:href="#a" xml:lang="en"></use></svg>').innerHTML).toBe(
      '<svg viewBox="0 0 1 1"><use xlink:href="#a" xml:lang="en"></use></svg>',
    );
  });

  test("comments, doctypes and processing instructions", () => {
    const el = div("<!--c-->");
    el.appendChild(document.createProcessingInstruction("t", "d"));
    expect(el.innerHTML).toBe("<!--c--><?t d?>");
    const doc = document.implementation.createHTMLDocument("x");
    expect(
      (doc as unknown as Document)[$impl].first?.node &&
        (doc.documentElement as Element).outerHTML.startsWith("<html>"),
    ).toBe(true);
  });

  test("no extra U+000A is serialized for pre/textarea/listing (the parser dropped it)", () => {
    expect(div("<pre>\n\nx</pre>").innerHTML).toBe("<pre>\nx</pre>");
  });

  test("outerHTML of an element includes the element itself", () => {
    expect(div("<span id=a>x</span>").firstElementChild!.outerHTML).toBe('<span id="a">x</span>');
  });
});

describe("getHTML() — https://html.spec.whatwg.org/#dom-element-gethtml", () => {
  test("serializableShadowRoots includes shadow roots marked serializable as declarative templates", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open", serializable: true });
    shadow.innerHTML = "<b>in</b>";
    host.innerHTML = "<i>light</i>";
    expect(getHTML(host[$impl], { serializableShadowRoots: true })).toBe(
      '<template shadowrootmode="open" shadowrootserializable=""><b>in</b></template><i>light</i>',
    );
    expect(getHTML(host[$impl])).toBe("<i>light</i>");
  });

  test("shadowRoots lists roots to include even when not serializable", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = "x";
    expect(getHTML(host[$impl], { shadowRoots: [shadow] })).toBe('<template shadowrootmode="closed">x</template>');
  });

  test("setHTMLUnsafe parses declarative shadow roots", () => {
    const host = document.createElement("div");
    setHTMLUnsafe(host[$impl], '<section><template shadowrootmode="open"><p>s</p></template>light</section>');
    const section = host.firstElementChild!;
    expect(section.shadowRoot?.innerHTML).toBe("<p>s</p>");
    expect(section.innerHTML).toBe("light");
  });

  test("innerHTML does not create declarative shadow roots", () => {
    const host = div('<section><template shadowrootmode="open"><p>s</p></template></section>');
    expect(host.firstElementChild!.shadowRoot).toBeNull();
  });
});

describe("HTML parsing entry points — https://html.spec.whatwg.org/#html-fragment-parsing-algorithm", () => {
  test("fragment parsing uses the context element: <tr> markup in a <tbody> context", () => {
    const tbody = document.createElement("tbody");
    const fragment = parseFragment("<tr><td>1</td></tr>", tbody[$impl]);
    expect(fragment.first?.name).toBe("tr");
  });

  test("RCDATA context: textarea content is text", () => {
    const ta = document.createElement("textarea");
    ta.innerHTML = "<b>&amp;</b>";
    expect(ta.textContent).toBe("<b>&</b>");
  });

  test("parseDocument sets quirks mode from the DOCTYPE (initial insertion mode)", () => {
    const quirks = Document._createHTML(null);
    parseDocument("<p>x", quirks);
    expect(quirks.compatMode).toBe("BackCompat");
    const standards = Document._createHTML(null);
    parseDocument("<!doctype html><p id=x>x", standards);
    expect(standards.compatMode).toBe("CSS1Compat");
    expect(standards.getElementById("x")?.textContent).toBe("x");
  });

  test("parsed trees are connected through the normal insert algorithm (id index)", () => {
    document.body!.innerHTML = '<div id="deep"><span id="inner"></span></div>';
    expect(document.getElementById("inner")?.localName).toBe("span");
  });
});

describe("XML serialization — https://w3c.github.io/DOM-Parsing/#dfn-xml-serialization", () => {
  test("HTML elements get the XHTML default namespace declared; void elements self-close", () => {
    expect(serializeXML(div("<br>")[$impl], false)).toBe('<div xmlns="http://www.w3.org/1999/xhtml"><br /></div>');
  });

  test("non-HTML empty elements self-close and text escapes & < >", () => {
    const doc = new Document();
    const r = doc.createElementNS("urn:a", "r");
    r.appendChild(doc.createElementNS("urn:a", "e"));
    r.appendChild(doc.createTextNode("<&>"));
    expect(serializeXML(r[$impl], false)).toBe('<r xmlns="urn:a"><e/>&lt;&amp;&gt;</r>');
  });

  test("prefixed elements declare their prefix", () => {
    const doc = new Document();
    expect(serializeXML(doc.createElementNS("urn:x", "x:a")[$impl], false)).toBe('<x:a xmlns:x="urn:x"/>');
  });

  test("require well-formed throws InvalidStateError for comments containing --", () => {
    const doc = new Document();
    const r = doc.createElementNS(null, "r");
    r.appendChild(doc.createComment("a--b"));
    expect(() => serializeXML(r[$impl], true)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    expect(serializeXML(r[$impl], false)).toBe("<r><!--a--b--></r>");
  });
});

describe("XML parsing — https://html.spec.whatwg.org/#dom-domparser-parsefromstring", () => {
  function xml(src: string): Document {
    const doc = new Document();
    doc[$contentType] = "application/xml";
    parseXML(src, doc, "application/xml");
    return doc;
  }

  test("namespaces, prefixes, CDATA, comments and processing instructions", () => {
    const doc = xml(
      '<?xml version="1.0"?><r xmlns="urn:a" xmlns:x="urn:x"><x:c x:at="1">t<![CDATA[<raw>]]></x:c><!--c--><?pi d?></r>',
    );
    const r = doc.documentElement!;
    expect(r.namespaceURI).toBe("urn:a");
    const c = r.firstElementChild!;
    expect([c.namespaceURI, c.prefix, c.localName, c.getAttributeNS("urn:x", "at")]).toEqual(["urn:x", "x", "c", "1"]);
    expect(c.childNodes.length).toBe(2);
    expect(c.lastChild!.nodeType).toBe(4);
    expect(r.childNodes[1].nodeType).toBe(8);
    expect(r.childNodes[2].nodeType).toBe(7);
  });

  test("a well-formedness error produces a parsererror document", () => {
    const doc = xml("<r><a></b></r>");
    expect(doc.documentElement!.localName).toBe("parsererror");
    expect(doc.documentElement!.namespaceURI).toBe(PARSERERROR_NS);
    expect(doc.getElementsByTagName("parsererror").length).toBe(1);
  });

  test("XML fragment parsing for innerHTML in XML documents; not well-formed throws SyntaxError", () => {
    const doc = xml('<r xmlns="urn:a"/>');
    const r = doc.documentElement!;
    r.innerHTML = "<k>v</k>";
    expect(r.firstElementChild!.namespaceURI).toBe("urn:a");
    expect(r.innerHTML).toBe('<k xmlns="urn:a">v</k>');
    expect(() => {
      r.innerHTML = "<k>";
    }).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });
});
