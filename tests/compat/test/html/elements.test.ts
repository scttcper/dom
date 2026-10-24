/**
 * Element interfaces with observable IDL behavior beyond plain reflection: hyperlinks and areas,
 * base, image maps, tables, img/Image, title/script/style/link, iframe/object/canvas, media and
 * TimeRanges, unknown elements, slots and document.fgColor — differential against jsdom.
 *
 * Spec: HTML Standard
 *   - hyperlinks:     https://html.spec.whatwg.org/#htmlanchorelement, https://html.spec.whatwg.org/#dom-a-text,
 *                     https://html.spec.whatwg.org/#dom-hyperlink-href, https://html.spec.whatwg.org/#update-href,
 *                     https://html.spec.whatwg.org/#concept-hyperlink-url-set, https://html.spec.whatwg.org/#htmlareaelement,
 *                     https://html.spec.whatwg.org/#the-area-element
 *   - base:           https://html.spec.whatwg.org/#dom-base-href
 *   - image maps:     https://html.spec.whatwg.org/#dom-map-areas
 *   - tables:         https://html.spec.whatwg.org/#dom-table-rows, https://html.spec.whatwg.org/#dom-table-insertrow,
 *                     https://html.spec.whatwg.org/#dom-tr-rowindex
 *   - images:         https://html.spec.whatwg.org/#htmlimageelement, https://html.spec.whatwg.org/#dom-img-width,
 *                     https://html.spec.whatwg.org/#dom-image
 *   - metadata:       https://html.spec.whatwg.org/#the-title-element-2, https://html.spec.whatwg.org/#dom-title-text,
 *                     https://html.spec.whatwg.org/#the-style-element, https://html.spec.whatwg.org/#dom-style-disabled,
 *                     https://html.spec.whatwg.org/#the-link-element
 *   - scripting:      https://html.spec.whatwg.org/#htmlscriptelement, https://html.spec.whatwg.org/#dom-script-text,
 *                     https://html.spec.whatwg.org/#dom-script-async, https://html.spec.whatwg.org/#dom-document-currentscript,
 *                     https://html.spec.whatwg.org/#child-text-content
 *   - embedded:       https://html.spec.whatwg.org/#htmliframeelement, https://html.spec.whatwg.org/#dom-iframe-contentdocument,
 *                     https://html.spec.whatwg.org/#htmlobjectelement, https://html.spec.whatwg.org/#htmlcanvaselement
 *   - media:          https://html.spec.whatwg.org/#htmlmediaelement, https://html.spec.whatwg.org/#dom-media-load,
 *                     https://html.spec.whatwg.org/#dom-media-pause, https://html.spec.whatwg.org/#dom-media-muted,
 *                     https://html.spec.whatwg.org/#dom-navigator-canplaytype, https://html.spec.whatwg.org/#dom-audio,
 *                     https://html.spec.whatwg.org/#timeranges
 *   - other:          https://html.spec.whatwg.org/#htmlunknownelement, https://html.spec.whatwg.org/#element-interface,
 *                     https://html.spec.whatwg.org/#dom-document-fgcolor, https://html.spec.whatwg.org/#semantics
 *   - slots:          https://html.spec.whatwg.org/#dom-slot-assignednodes, https://html.spec.whatwg.org/#dom-slot-assignedelements
 */
import { describe } from "vitest";
import { describeNode, differential, type AnyWindow } from "../../src/harness.ts";

const names = (list: ArrayLike<AnyWindow>) => Array.from(list, describeNode);

describe("hyperlinks — https://html.spec.whatwg.org/#htmlanchorelement", () => {
  differential("text is the descendant text content and its setter replaces children (https://html.spec.whatwg.org/#dom-a-text)", (w) => {
    w.document.body.innerHTML = `<a id=a href=x>one <b>two</b></a>`;
    const a = w.document.getElementById("a");
    const before = a.text;
    a.text = "three";
    return [before, a.innerHTML];
  });

  differential("component setters update the href attribute; an unparsable href is returned as is (https://html.spec.whatwg.org/#update-href, https://html.spec.whatwg.org/#dom-hyperlink-href)", (w) => {
    w.document.body.innerHTML = `<a id=a href="/p?q#h">a</a><a id=bad href="http://[bad">b</a>`;
    const a = w.document.getElementById("a");
    a.pathname = "/new path";
    a.search = "x=1";
    a.hash = "";
    const bad = w.document.getElementById("bad");
    return { href: a.href, attr: a.getAttribute("href"), bad: [bad.href, bad.host, bad.protocol] };
  });

  differential("the URL is re-parsed when the href attribute or the base URL changes (https://html.spec.whatwg.org/#concept-hyperlink-url-set)", (w) => {
    w.document.body.innerHTML = `<a id=a href="rel">a</a>`;
    const a = w.document.getElementById("a");
    const before = a.href;
    const base = w.document.createElement("base");
    base.href = "http://other.test/dir/";
    w.document.head.appendChild(base);
    const withBase = a.href;
    a.setAttribute("href", "x");
    return [before, withBase, a.href];
  });

  differential("area elements expose the same URL decomposition (https://html.spec.whatwg.org/#htmlareaelement, https://html.spec.whatwg.org/#the-area-element)", (w) => {
    w.document.body.innerHTML = `<map name=m><area id=ar href="https://u:p@ex.test:8080/a?b#c" alt=x></map>`;
    const ar = w.document.getElementById("ar");
    return [ar.protocol, ar.username, ar.password, ar.host, ar.hostname, ar.port, ar.pathname, ar.search, ar.hash, ar.origin, String(ar)];
  });
});

describe("base — https://html.spec.whatwg.org/#dom-base-href", () => {
  differential("href resolves against the fallback base URL; without the attribute it is the document URL", (w) => {
    const b = w.document.createElement("base");
    const none = b.href;
    b.setAttribute("href", "sub/");
    const rel = b.href;
    b.setAttribute("href", "http://[");
    return [none, rel, b.href];
  });
});

describe("image maps — https://html.spec.whatwg.org/#dom-map-areas", () => {
  differential("areas is a live collection of area descendants", (w) => {
    w.document.body.innerHTML = `<map id=m><area id=a1><div><area id=a2></div></map>`;
    const m = w.document.getElementById("m");
    const areas = m.areas;
    m.appendChild(w.document.createElement("area"));
    return [areas.length, areas === m.areas, names(areas)];
  });
});

describe("tables — https://html.spec.whatwg.org/#dom-table-rows", () => {
  differential("rows orders thead rows, then tbody / direct rows, then tfoot rows; rowIndex follows it (https://html.spec.whatwg.org/#dom-tr-rowindex)", (w) => {
    w.document.body.innerHTML = `<table id=t><tfoot><tr id=f></tr></tfoot><tbody><tr id=b1></tr></tbody><thead><tr id=h></tr></thead><tbody><tr id=b2></tr></tbody></table>`;
    const t = w.document.getElementById("t");
    const loose = w.document.createElement("tr");
    return [names(t.rows), t.rows.namedItem("b2")?.id, ["f", "b1", "h", "b2"].map((id) => w.document.getElementById(id).rowIndex), loose.rowIndex];
  });

  differential("insertRow(-1) appends to the last tbody, creates a tbody when there is none, and throws IndexSizeError out of range (https://html.spec.whatwg.org/#dom-table-insertrow)", (w) => {
    const t = w.document.createElement("table");
    const first = t.insertRow();
    const created = t.firstElementChild.localName;
    t.insertRow(0).id = "zero";
    let threw = "";
    try {
      t.insertRow(5);
    } catch (e) {
      threw = (e as Error).name;
    }
    return [first.localName, created, t.outerHTML, threw];
  });
});

describe("images — https://html.spec.whatwg.org/#htmlimageelement", () => {
  differential("width/height return the attribute value or 0 without layout; naturalWidth is 0 (https://html.spec.whatwg.org/#dom-img-width)", (w) => {
    w.document.body.innerHTML = `<img id=a width=40 height=bogus><img id=b>`;
    const a = w.document.getElementById("a");
    const b = w.document.getElementById("b");
    a.width = 12;
    return [a.width, a.height, a.getAttribute("width"), b.width, b.naturalWidth];
  });

  differential("new Image(w, h) creates an img in the current document with width/height set (https://html.spec.whatwg.org/#dom-image)", (w) => {
    const i = new w.Image(5, 6);
    const j = new w.Image();
    return [i.localName, i.getAttribute("width"), i.getAttribute("height"), j.hasAttribute("width"), i.ownerDocument === w.document];
  });
});

describe("metadata elements — https://html.spec.whatwg.org/#the-title-element-2", () => {
  differential("title.text is the child text content (not descendants) and its setter replaces children (https://html.spec.whatwg.org/#dom-title-text, https://html.spec.whatwg.org/#child-text-content)", (w) => {
    const t = w.document.createElement("title");
    t.appendChild(w.document.createTextNode("a"));
    t.appendChild(w.document.createElement("b")).textContent = "nested";
    t.appendChild(w.document.createTextNode("c"));
    const before = t.text;
    t.text = "new";
    return [before, t.childNodes.length, t.text];
  });

  differential("style.disabled is false without a sheet and toggles the sheet's disabled flag (https://html.spec.whatwg.org/#dom-style-disabled, https://html.spec.whatwg.org/#the-style-element)", (w) => {
    const s = w.document.createElement("style");
    const detached = [s.disabled, s.sheet];
    s.disabled = true;
    const afterSet = s.disabled;
    s.textContent = "p { color: red }";
    w.document.head.appendChild(s);
    s.disabled = true;
    return [detached, afterSet, s.disabled, s.sheet.disabled];
  });

  differential("link elements: relList, sheet null without a stylesheet (https://html.spec.whatwg.org/#the-link-element)", (w) => {
    const l = w.document.createElement("link");
    l.rel = "preload stylesheet";
    w.document.head.appendChild(l);
    return [l.relList.length, l.relList.contains("stylesheet"), l.relList.supports("preload"), l.sheet];
  }, {
    jsdomDeviation: {
      expected: [2, true, true, null],
      spec: "https://html.spec.whatwg.org/#linkTypes (preload is a link type with a processing model, so a supported token of link's relList; https://html.spec.whatwg.org/#the-link-element)",
      reason: "jsdom's link relList supports only stylesheet",
    },
  });
});

describe("scripting — https://html.spec.whatwg.org/#htmlscriptelement", () => {
  differential("text is the child text content; setting it replaces children (https://html.spec.whatwg.org/#dom-script-text)", (w) => {
    const s = w.document.createElement("script");
    s.appendChild(w.document.createTextNode("a"));
    s.appendChild(w.document.createComment("c"));
    s.appendChild(w.document.createTextNode("b"));
    const before = s.text;
    s.text = "x";
    return [before, s.childNodes.length];
  });

  differential("async: true for a script element created by script (non-blocking) until async is set (https://html.spec.whatwg.org/#dom-script-async)", (w) => {
    w.document.body.innerHTML = `<script id=parsed type=text/plain></script>`;
    const s = w.document.createElement("script");
    const before = s.async;
    s.async = false;
    return [before, s.async, s.hasAttribute("async"), w.document.getElementById("parsed").async];
  }, {
    jsdomDeviation: {
      expected: [true, false, false, true],
      spec: "https://html.spec.whatwg.org/#dom-script-async (script-created elements start non-blocking)",
      reason: "jsdom 30 has no async IDL attribute (window/compat.ts). Parser-inserted scripts also report true here (docs/deviations.md)",
    },
  });

  differential("document.currentScript is null outside script execution (https://html.spec.whatwg.org/#dom-document-currentscript)", (w) => w.document.currentScript);
});

describe("embedded content — https://html.spec.whatwg.org/#htmliframeelement", () => {
  differential("iframe.contentDocument is null while disconnected and an about:blank document when connected (https://html.spec.whatwg.org/#dom-iframe-contentdocument)", (w) => {
    const f = w.document.createElement("iframe");
    const before = f.contentDocument;
    w.document.body.appendChild(f);
    const doc = f.contentDocument;
    return [before, doc?.URL, doc?.body?.localName, f.contentWindow?.document === doc];
  });

  differential("object: no nested document, listed and form-associated (https://html.spec.whatwg.org/#htmlobjectelement)", (w) => {
    w.document.body.innerHTML = `<form id=f><object id=o name=o data="x.svg"></object></form>`;
    const o = w.document.getElementById("o");
    return [o.contentDocument, describeNode(o.form), o.willValidate, w.document.getElementById("f").elements.length];
  });

  differential("canvas: 300×150 by default; width/height reflect as unsigned longs (https://html.spec.whatwg.org/#htmlcanvaselement)", (w) => {
    const c = w.document.createElement("canvas");
    const d = [c.width, c.height];
    c.width = 10;
    c.setAttribute("height", "-5");
    return [d, c.width, c.height, c.getAttribute("width")];
  });
});

describe("media — https://html.spec.whatwg.org/#htmlmediaelement", () => {
  differential("initial state, canPlayType('') and an empty buffered TimeRanges (https://html.spec.whatwg.org/#dom-navigator-canplaytype, https://html.spec.whatwg.org/#timeranges)", (w) => {
    const v = w.document.createElement("video");
    let threw = "";
    try {
      v.buffered.start(0);
    } catch (e) {
      threw = (e as Error).name;
    }
    return { paused: v.paused, readyState: v.readyState, networkState: v.networkState, can: v.canPlayType(""), buffered: v.buffered.length, threw, duration: v.duration };
  }, {
    jsdomDeviation: {
      expected: { paused: true, readyState: 0, networkState: 0, can: "", buffered: 0, threw: "IndexSizeError", duration: Number.NaN },
      spec: "https://html.spec.whatwg.org/#dom-timeranges-start (index >= length throws IndexSizeError)",
      reason: "jsdom's empty TimeRanges returns undefined for start(0) instead of throwing",
    },
  });

  differential("muted IDL defaults from the muted content attribute and does not write it back (https://html.spec.whatwg.org/#dom-media-muted)", (w) => {
    w.document.body.innerHTML = `<video id=v muted></video>`;
    const v = w.document.getElementById("v");
    const before = v.muted;
    v.muted = false;
    return [before, v.muted, v.hasAttribute("muted"), v.defaultMuted];
  }, {
    jsdomDeviation: {
      expected: [true, false, true, true],
      spec: "https://html.spec.whatwg.org/#dom-media-muted (when a media element is created with a muted content attribute, muted is set to true)",
      reason: "jsdom initializes muted to false regardless of the attribute",
    },
  });

  differential("new Audio(src) is a preload=auto audio element with src set (https://html.spec.whatwg.org/#dom-audio)", (w) => {
    const a = new w.Audio("song.mp3");
    return [a.localName, a.getAttribute("src"), a.getAttribute("preload"), new w.Audio().hasAttribute("src")];
  });
});

describe("unknown elements — https://html.spec.whatwg.org/#htmlunknownelement", () => {
  differential("the element interface for a local name: unknown names are HTMLUnknownElement, valid custom element names HTMLElement (https://html.spec.whatwg.org/#element-interface)", (w) =>
    ["foo", "x-y", "applet", "blink", "isindex", "menuitem", "image", "rb", "listing", "xmp"].map((n) => w.document.createElement(n).constructor.name),
  );
});

describe("document.fgColor — https://html.spec.whatwg.org/#dom-document-fgcolor", () => {
  differential("reflects body's text attribute; fgColor/bgColor/linkColor are '' without a body", (w) => {
    w.document.body.setAttribute("text", "red");
    const out: unknown[] = [w.document.fgColor];
    w.document.fgColor = "blue";
    out.push(w.document.body.getAttribute("text"));
    w.document.body.remove();
    out.push(w.document.fgColor, w.document.bgColor);
    return out;
  }, {
    jsdomDeviation: {
      expected: ["red", "blue", "", ""],
      spec: "https://html.spec.whatwg.org/#dom-document-fgcolor (reflects body's text attribute; '' without a body)",
      reason: "jsdom 30 has no fgColor/bgColor (window/compat.ts lists them)",
    },
  });
});

describe("slots — https://html.spec.whatwg.org/#dom-slot-assignednodes", () => {
  differential("assignedNodes/assignedElements with and without flatten (https://html.spec.whatwg.org/#dom-slot-assignedelements)", (w) => {
    w.document.body.innerHTML = `<div id=host><span slot=a id=s1>1</span>text<b id=b>b</b></div>`;
    const root = w.document.getElementById("host").attachShadow({ mode: "open" });
    root.innerHTML = `<slot name=a id=sa></slot><slot id=def><i id=fallback>f</i></slot><slot name=none id=empty><em id=fb2>x</em></slot>`;
    const $ = (id: string) => root.getElementById(id);
    return {
      a: names($("sa").assignedNodes()),
      def: names($("def").assignedNodes()),
      defElements: names($("def").assignedElements()),
      emptyFlat: names($("empty").assignedNodes({ flatten: true })),
      empty: names($("empty").assignedNodes()),
    };
  });
});
