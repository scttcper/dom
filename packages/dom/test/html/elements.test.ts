/**
 * Element behaviors of the HTML Standard (non-form elements).
 *
 * Spec sections under test (HTML Standard):
 *   §3.2.6 global attributes: hidden, translate, draggable, contenteditable
 *     https://html.spec.whatwg.org/#the-hidden-attribute
 *     https://html.spec.whatwg.org/#attr-translate
 *     https://html.spec.whatwg.org/#the-draggable-attribute
 *     https://html.spec.whatwg.org/#contenteditable
 *   §6.2 HTMLElement.click(): https://html.spec.whatwg.org/#dom-click
 *   innerText/outerText: https://html.spec.whatwg.org/#the-innertext-idl-attribute
 *   <a>/<area> HTMLHyperlinkElementUtils: https://html.spec.whatwg.org/#htmlhyperlinkelementutils
 *   <details>/<summary>: https://html.spec.whatwg.org/#the-details-element
 *   <dialog>: https://html.spec.whatwg.org/#the-dialog-element
 *   popover: https://html.spec.whatwg.org/#the-popover-attribute
 *   <template>: https://html.spec.whatwg.org/#the-template-element
 *   <img>, Image(): https://html.spec.whatwg.org/#the-img-element
 *   media elements: https://html.spec.whatwg.org/#media-elements
 *   <canvas>: https://html.spec.whatwg.org/#the-canvas-element
 *   <iframe>: https://html.spec.whatwg.org/#the-iframe-element
 *   <title>, document.title: https://html.spec.whatwg.org/#document.title
 *   <style>: https://html.spec.whatwg.org/#update-a-style-block
 *   <script>: https://html.spec.whatwg.org/#the-script-element
 *   <slot>: https://html.spec.whatwg.org/#the-slot-element
 *   tables: https://html.spec.whatwg.org/#the-table-element
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { styleSheetHooks } from "../../src/html/resources.ts";

let window: any;
let document: any;

beforeEach(() => {
  window = createWindow({ url: "http://localhost/dir/page.html" });
  document = window.document;
});

const nextTask = () => new Promise((r) => setTimeout(r, 1));

describe("global attributes — https://html.spec.whatwg.org/#global-attributes", () => {
  // Deviation (docs/deviations.md): the getter returns true for until-found, like jsdom/happy-dom.
  test("hidden: the setter writes \"until-found\"; the getter is a boolean", () => {
    const d = document.createElement("div");
    expect(d.hidden).toBe(false);
    d.hidden = true;
    expect(d.getAttribute("hidden")).toBe("");
    d.hidden = "UNTIL-FOUND";
    expect(d.getAttribute("hidden")).toBe("until-found");
    expect(d.hidden).toBe(true);
    d.hidden = 0;
    expect(d.hasAttribute("hidden")).toBe(false);
    d.hidden = "x";
    expect(d.hidden).toBe(true);
  });

  test("translate inherits from the nearest ancestor with the attribute", () => {
    document.body.innerHTML = '<div translate="no"><span><b></b></span></div>';
    const b = document.querySelector("b");
    expect(b.translate).toBe(false);
    b.translate = true;
    expect(b.getAttribute("translate")).toBe("yes");
    expect(document.body.translate).toBe(true);
  });

  test("draggable defaults to true for img and a[href]", () => {
    expect(document.createElement("img").draggable).toBe(true);
    const a = document.createElement("a");
    expect(a.draggable).toBe(false);
    a.href = "x";
    expect(a.draggable).toBe(true);
    const div = document.createElement("div");
    div.draggable = true;
    expect(div.getAttribute("draggable")).toBe("true");
  });

  test("contentEditable / isContentEditable", () => {
    document.body.innerHTML = '<div contenteditable><p><b>x</b></p><p contenteditable="false"><i></i></p></div>';
    const div = document.body.firstChild;
    expect(div.contentEditable).toBe("true");
    expect(document.querySelector("b").isContentEditable).toBe(true);
    expect(document.querySelector("i").isContentEditable).toBe(false);
    expect(document.querySelector("b").contentEditable).toBe("inherit");
    expect(() => (div.contentEditable = "bogus")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    div.contentEditable = "inherit";
    expect(div.hasAttribute("contenteditable")).toBe(false);
  });

  test("dataset maps data-* attributes", () => {
    const d = document.createElement("div");
    d.dataset.fooBar = "1";
    expect(d.getAttribute("data-foo-bar")).toBe("1");
    expect(document.createElementNS("http://www.w3.org/2000/svg", "g").dataset).toBeDefined();
  });
});

describe("HTMLElement.click() — https://html.spec.whatwg.org/#dom-click", () => {
  test("fires an untrusted, bubbling, cancelable, composed PointerEvent", () => {
    const d = document.body.appendChild(document.createElement("div"));
    let ev: any = null;
    document.body.addEventListener("click", (e: any) => (ev = e));
    d.click();
    expect(ev).toBeInstanceOf(window.PointerEvent);
    expect([ev.isTrusted, ev.bubbles, ev.cancelable, ev.composed]).toEqual([false, true, true, true]);
  });

  test("the click-in-progress flag prevents re-entrant clicks", () => {
    const d = document.createElement("div");
    let count = 0;
    d.addEventListener("click", () => {
      count++;
      d.click();
    });
    d.click();
    expect(count).toBe(1);
  });
});

describe("innerText — https://html.spec.whatwg.org/#the-innertext-idl-attribute", () => {
  test("block elements break lines, p adds blank lines, whitespace collapses", () => {
    document.body.innerHTML = "<div id=t>  Hello   <b>big</b>\n world<p>Para</p><div>Block</div>end<br>line</div>";
    expect(document.getElementById("t").innerText).toBe("Hello big world\n\nPara\n\nBlock\nend\nline");
  });

  test("display:none UA elements are skipped; pre preserves whitespace", () => {
    document.body.innerHTML = "<div id=t>a<script>x</script><span hidden>h</span><pre>  p  q</pre></div>";
    expect(document.getElementById("t").innerText).toBe("a\n  p  q");
  });

  test("table cells are tab-separated and rows newline-separated", () => {
    document.body.innerHTML = "<table id=t><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";
    expect(document.getElementById("t").innerText).toBe("a\tb\nc\td");
  });

  test("a disconnected element returns its text content", () => {
    const d = document.createElement("div");
    d.innerHTML = "<p>a</p>  <p>b</p>";
    expect(d.innerText).toBe("a  b");
  });

  test("setter replaces children with text and <br> for line breaks", () => {
    const d = document.createElement("div");
    d.innerText = "a\nb\r\nc";
    expect(d.innerHTML).toBe("a<br>b<br>c");
  });

  test("outerText setter replaces the element and merges adjacent text", () => {
    document.body.innerHTML = "<div id=t>x<b>old</b>y</div>";
    document.querySelector("b").outerText = "new";
    const t = document.getElementById("t");
    expect(t.childNodes.length).toBe(1);
    expect(t.textContent).toBe("xnewy");
  });
});

describe("HTMLHyperlinkElementUtils — https://html.spec.whatwg.org/#htmlhyperlinkelementutils", () => {
  test("href resolves against the document base URL; components are exposed", () => {
    const a = document.createElement("a");
    a.setAttribute("href", "../x/y?q=1#h");
    expect(a.href).toBe("http://localhost/x/y?q=1#h");
    expect([a.protocol, a.host, a.hostname, a.port, a.pathname, a.search, a.hash, a.origin]).toEqual([
      "http:",
      "localhost",
      "localhost",
      "",
      "/x/y",
      "?q=1",
      "#h",
      "http://localhost",
    ]);
    expect(String(a)).toBe(a.href);
  });

  test("setters update the href attribute", () => {
    const a = document.createElement("a");
    a.href = "http://example.com/a";
    a.pathname = "/b";
    a.search = "z=2";
    a.hash = "frag";
    a.port = "8080";
    expect(a.getAttribute("href")).toBe("http://example.com:8080/b?z=2#frag");
  });

  test("without href: protocol is ':' and the others are empty; setters are no-ops", () => {
    const a = document.createElement("a");
    expect(a.href).toBe("");
    expect(a.protocol).toBe(":");
    a.pathname = "/x";
    expect(a.hasAttribute("href")).toBe(false);
  });

  test("text and relList", () => {
    const a = document.createElement("a");
    a.innerHTML = "<b>hi</b> there";
    expect(a.text).toBe("hi there");
    a.rel = "noopener nofollow";
    expect(a.relList.contains("noopener")).toBe(true);
    expect(a.relList.supports("noreferrer")).toBe(true);
  });

  test("clicking a link does not navigate; #fragment links update location.hash", () => {
    document.body.innerHTML = '<a id=f href="#sec">f</a><a id=o href="http://example.com/">o</a>';
    document.getElementById("o").click();
    expect(window.location.href).toBe("http://localhost/dir/page.html");
    document.getElementById("f").click();
    expect(window.location.hash).toBe("#sec");
  });

  test("a canceled click does not follow the link", () => {
    document.body.innerHTML = '<a id=f href="#sec">f</a>';
    const a = document.getElementById("f");
    a.addEventListener("click", (e: any) => e.preventDefault());
    a.click();
    expect(window.location.hash).toBe("");
  });
});

describe("<details> and <summary> — https://html.spec.whatwg.org/#the-details-element", () => {
  test("activating the summary toggles open; toggle fires asynchronously with states", async () => {
    document.body.innerHTML = "<details><summary>s</summary>body</details>";
    const details = document.body.firstChild;
    const events: string[] = [];
    details.addEventListener("toggle", (e: any) => events.push(`${e.oldState}->${e.newState}`));
    details.firstChild.click();
    expect(details.open).toBe(true);
    expect(events).toEqual([]);
    await nextTask();
    expect(events).toEqual(["closed->open"]);
  });

  test("toggle tasks coalesce: open then close before the task runs fires once with the original old state", async () => {
    const details = document.body.appendChild(document.createElement("details"));
    const events: string[] = [];
    details.addEventListener("toggle", (e: any) => events.push(`${e.oldState}->${e.newState}`));
    details.open = true;
    details.open = false;
    await nextTask();
    expect(events).toEqual(["closed->closed"]);
  });

  test("a non-first summary does not toggle", () => {
    document.body.innerHTML = "<details><summary>a</summary><summary>b</summary></details>";
    document.body.firstChild.lastChild.click();
    expect(document.body.firstChild.open).toBe(false);
  });

  test("a canceled click does not toggle", () => {
    document.body.innerHTML = "<details><summary>a</summary></details>";
    const s = document.querySelector("summary");
    s.addEventListener("click", (e: any) => e.preventDefault());
    s.click();
    expect(document.body.firstChild.open).toBe(false);
  });

  test("details name groups are exclusive", () => {
    document.body.innerHTML = '<details name=g open id=a></details><details name=g id=b></details>';
    document.getElementById("b").open = true;
    expect(document.getElementById("a").open).toBe(false);
  });
});

describe("<dialog> — https://html.spec.whatwg.org/#the-dialog-element", () => {
  test("show() opens non-modally; showModal() on an open non-modal dialog throws", () => {
    const d = document.body.appendChild(document.createElement("dialog"));
    d.show();
    expect(d.open).toBe(true);
    expect(d.matches(":modal")).toBe(false);
    expect(() => d.showModal()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  test("showModal() requires a connected dialog and matches :modal", () => {
    const d = document.createElement("dialog");
    expect(() => d.showModal()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    document.body.appendChild(d);
    d.showModal();
    expect(d.open).toBe(true);
    expect(d.matches(":modal")).toBe(true);
  });

  test("close(value) sets returnValue, fires close asynchronously and restores focus", async () => {
    document.body.innerHTML = "<button id=opener>o</button><dialog><input id=i></dialog>";
    const opener = document.getElementById("opener");
    opener.focus();
    const d = document.querySelector("dialog");
    d.showModal();
    expect(document.activeElement.id).toBe("i");
    let closed = false;
    d.addEventListener("close", () => (closed = true));
    d.close("done");
    expect(d.open).toBe(false);
    expect(d.returnValue).toBe("done");
    expect(document.activeElement).toBe(opener);
    expect(closed).toBe(false);
    await nextTask();
    expect(closed).toBe(true);
  });

  test("requestClose() fires a cancelable cancel event first", () => {
    const d = document.body.appendChild(document.createElement("dialog"));
    d.showModal();
    d.addEventListener("cancel", (e: any) => e.preventDefault(), { once: true });
    d.requestClose("x");
    expect(d.open).toBe(true);
    d.requestClose("y");
    expect(d.open).toBe(false);
    expect(d.returnValue).toBe("y");
  });

  test("beforetoggle on show is cancelable", () => {
    const d = document.body.appendChild(document.createElement("dialog"));
    d.addEventListener("beforetoggle", (e: any) => e.preventDefault());
    d.show();
    expect(d.open).toBe(false);
  });

  test("removing an open modal dialog removes it from the top layer", () => {
    const d = document.body.appendChild(document.createElement("dialog"));
    d.showModal();
    d.remove();
    expect(d.matches(":modal")).toBe(false);
  });
});

describe("popover — https://html.spec.whatwg.org/#the-popover-attribute", () => {
  test("popover IDL attribute reflects with auto/manual/hint keywords", () => {
    const d = document.createElement("div");
    expect(d.popover).toBeNull();
    d.setAttribute("popover", "");
    expect(d.popover).toBe("auto");
    d.setAttribute("popover", "bogus");
    expect(d.popover).toBe("manual");
  });

  test("showPopover/hidePopover toggle :popover-open and fire beforetoggle + async toggle", async () => {
    document.body.innerHTML = "<div popover id=p>x</div>";
    const p = document.getElementById("p");
    const log: string[] = [];
    p.addEventListener("beforetoggle", (e: any) => log.push(`before ${e.oldState}->${e.newState}`));
    p.addEventListener("toggle", (e: any) => log.push(`toggle ${e.oldState}->${e.newState}`));
    p.showPopover();
    expect(p.matches(":popover-open")).toBe(true);
    await nextTask();
    p.hidePopover();
    expect(p.matches(":popover-open")).toBe(false);
    await nextTask();
    expect(log).toEqual(["before closed->open", "toggle closed->open", "before open->closed", "toggle open->closed"]);
  });

  test("errors: no popover attribute → NotSupportedError, disconnected → InvalidStateError", () => {
    expect(() => document.createElement("div").showPopover()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    const p = document.createElement("div");
    p.popover = "auto";
    expect(() => p.showPopover()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  test("togglePopover returns the new state and honors force", () => {
    document.body.innerHTML = "<div popover=manual id=p></div>";
    const p = document.getElementById("p");
    expect(p.togglePopover()).toBe(true);
    expect(p.togglePopover(true)).toBe(true);
    expect(p.togglePopover()).toBe(false);
  });

  test("showing an auto popover hides other unrelated auto popovers; nested ones stay", () => {
    document.body.innerHTML = "<div popover id=a><div popover id=nested></div></div><div popover id=b></div>";
    const [a, nested, b] = ["a", "nested", "b"].map((id) => document.getElementById(id));
    a.showPopover();
    nested.showPopover();
    expect(a.matches(":popover-open")).toBe(true);
    b.showPopover();
    expect([a, nested, b].map((e) => e.matches(":popover-open"))).toEqual([false, false, true]);
  });

  test("removing a showing popover hides it", () => {
    document.body.innerHTML = "<div popover id=p></div>";
    const p = document.getElementById("p");
    p.showPopover();
    p.remove();
    expect(p.matches(":popover-open")).toBe(false);
  });
});

describe("<template> — https://html.spec.whatwg.org/#the-template-element", () => {
  test("parsed children go into content, owned by an inert document", () => {
    document.body.innerHTML = "<template><p>hi</p></template>";
    const t = document.body.firstChild;
    expect(t.childNodes.length).toBe(0);
    expect(t.content.firstChild.localName).toBe("p");
    expect(t.content.ownerDocument).not.toBe(document);
    expect(t.content.ownerDocument.defaultView).toBeNull();
    expect(t.content).toBe(t.content);
    expect(t.innerHTML).toBe("<p>hi</p>");
  });

  test("deep clones copy the contents, shallow clones do not", () => {
    document.body.innerHTML = "<template><p>hi</p></template>";
    const t = document.body.firstChild;
    expect(t.cloneNode(true).content.firstChild.textContent).toBe("hi");
    expect(t.cloneNode(false).content.firstChild).toBeNull();
  });

  test("a template cannot be inserted into its own contents", () => {
    const t = document.createElement("template");
    expect(() => t.content.appendChild(t)).toThrow(expect.objectContaining({ name: "HierarchyRequestError" }));
  });

  test("custom elements inside template contents are not upgraded", () => {
    let constructed = 0;
    window.customElements.define(
      "tpl-el",
      class extends window.HTMLElement {
        constructor() {
          super();
          constructed++;
        }
      },
    );
    document.body.innerHTML = "<template><tpl-el></tpl-el></template>";
    expect(constructed).toBe(0);
    document.body.appendChild(document.importNode(document.body.firstChild.content, true));
    expect(constructed).toBe(1);
  });
});

describe("embedded content — https://html.spec.whatwg.org/#embedded-content", () => {
  test("img: no fetch; complete only without a source, natural size 0, decode() resolves; width/height reflect", async () => {
    // https://html.spec.whatwg.org/#dom-img-complete — a never-fetched request is pending.
    const img = document.createElement("img");
    expect(img.complete).toBe(true);
    img.src = "a.png";
    expect(img.src).toBe("http://localhost/dir/a.png");
    expect(img.complete).toBe(false);
    img.src = "";
    expect(img.complete).toBe(true);
    img.srcset = "b.png 2x";
    expect(img.complete).toBe(false);
    img.removeAttribute("srcset");
    expect(img.naturalWidth).toBe(0);
    img.width = 10;
    expect(img.getAttribute("width")).toBe("10");
    expect(img.width).toBe(10);
    await expect(img.decode()).resolves.toBeUndefined();
  });

  test("new Image(w, h) and new Audio(src) create elements in the current document", () => {
    const img = new window.Image(5, 6);
    expect(img).toBeInstanceOf(window.HTMLImageElement);
    expect(img.outerHTML).toBe('<img width="5" height="6">');
    const audio = new window.Audio("s.mp3");
    expect(audio).toBeInstanceOf(window.HTMLAudioElement);
    expect(audio.getAttribute("preload")).toBe("auto");
    expect(audio.src).toBe("http://localhost/dir/s.mp3");
    expect(() => (window.Image as any)()).toThrow(TypeError);
  });

  test("media: paused state machine; play() resolves and fires play/playing; pause() fires pause", async () => {
    const v = document.createElement("video");
    const log: string[] = [];
    for (const t of ["play", "playing", "pause"]) v.addEventListener(t, () => log.push(t));
    expect(v.paused).toBe(true);
    expect(Number.isNaN(v.duration)).toBe(true);
    expect(v.readyState).toBe(0);
    await v.play();
    expect(v.paused).toBe(false);
    v.pause();
    expect(v.paused).toBe(true);
    await nextTask();
    expect(log).toEqual(["play", "playing", "pause"]);
  });

  test("media: volume range and muted default from the attribute", () => {
    const a = document.createElement("audio");
    expect(() => (a.volume = 2)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
    a.setAttribute("muted", "");
    expect(a.muted).toBe(true);
    expect(a.defaultMuted).toBe(true);
  });

  test("canvas: getContext returns null, toDataURL returns data:,", () => {
    const c = document.createElement("canvas");
    expect(c.width).toBe(300);
    expect(c.height).toBe(150);
    expect(c.getContext("2d")).toBeNull();
    expect(c.toDataURL()).toBe("data:,");
  });

  test("iframe: minimal nested browsing context on insertion (tested in test/window/iframe.test.ts)", () => {
    const detached = document.createElement("iframe");
    expect(detached.contentWindow).toBeNull();
    const f = document.body.appendChild(document.createElement("iframe"));
    expect(f.contentWindow).not.toBeNull();
    expect(f.contentDocument).toBe(f.contentWindow!.document);
    f.sandbox.add("allow-scripts");
    expect(f.getAttribute("sandbox")).toBe("allow-scripts");
  });
});

describe("document metadata — https://html.spec.whatwg.org/#document-metadata", () => {
  test("document.title reads the first title element with whitespace collapsed", () => {
    document.head.innerHTML = "<title>  a \n  b </title><title>second</title>";
    expect(document.title).toBe("a b");
  });

  test("setting document.title creates a title in head when missing", () => {
    document.title = "New";
    expect(document.head.innerHTML).toBe("<title>New</title>");
    document.title = "Again";
    expect(document.querySelectorAll("title").length).toBe(1);
    expect(document.querySelector("title").text).toBe("Again");
  });

  test("style elements ask the css area for a sheet when connected / changed / removed", () => {
    const calls: string[] = [];
    const saved = { ...styleSheetHooks };
    styleSheetHooks.createSheet = (_o, text) => {
      calls.push("create " + text);
      return { text };
    };
    styleSheetHooks.removeSheet = (_o, sheet: any) => calls.push("remove " + sheet.text);
    try {
      const s = document.createElement("style");
      s.textContent = "a{}";
      expect(calls).toEqual([]);
      document.head.appendChild(s);
      expect(s.sheet).toEqual({ text: "a{}" });
      s.appendChild(document.createTextNode("b{}"));
      s.type = "text/plain";
      expect(s.sheet).toBeNull();
      s.type = "";
      s.remove();
      expect(calls).toEqual(["create a{}", "remove a{}", "create a{}b{}", "remove a{}b{}", "create a{}b{}", "remove a{}b{}"]);
    } finally {
      Object.assign(styleSheetHooks, saved);
    }
  });

  test("script is inert and reflects src/text", () => {
    document.body.innerHTML = "<script>window.ran = true</script>";
    const s = document.body.firstChild;
    expect(window.ran).toBeUndefined();
    expect(s.text).toBe("window.ran = true");
    expect(window.HTMLScriptElement.supports("module")).toBe(true);
  });
});

describe("tables — https://html.spec.whatwg.org/#the-table-element", () => {
  test("rows orders thead, body rows, tfoot; insertRow/deleteRow; cells", () => {
    document.body.innerHTML = "<table><tfoot><tr id=f></tr></tfoot><tbody><tr id=b></tr></tbody><thead><tr id=h></tr></thead></table>";
    const t = document.body.firstChild;
    expect([...t.rows].map((r: any) => r.id)).toEqual(["h", "b", "f"]);
    expect(document.getElementById("b").rowIndex).toBe(1);
    const r = t.insertRow(1);
    expect(r.parentNode.localName).toBe("tbody");
    expect(t.rows.length).toBe(4);
    t.deleteRow(-1);
    expect(t.rows.length).toBe(3);
    const c = r.insertCell();
    expect(c.cellIndex).toBe(0);
    expect(r.cells.length).toBe(1);
    expect(() => t.insertRow(10)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
  });

  test("caption/tHead/tFoot helpers", () => {
    const t = document.createElement("table");
    const cap = t.createCaption();
    expect(t.firstChild).toBe(cap);
    const head = t.createTHead();
    expect(t.tHead).toBe(head);
    t.createTFoot();
    t.createTBody();
    expect(t.tBodies.length).toBe(1);
    // createTBody inserts after the last tbody, or at the end of the table.
    expect(t.innerHTML).toBe("<caption></caption><thead></thead><tfoot></tfoot><tbody></tbody>");
    expect(() => (t.tHead = document.createElement("div"))).toThrow(expect.objectContaining({ name: "HierarchyRequestError" }));
  });

  test("colSpan/rowSpan are clamped", () => {
    const td = document.createElement("td");
    td.setAttribute("colspan", "5000");
    expect(td.colSpan).toBe(1000);
    td.setAttribute("rowspan", "0");
    expect(td.rowSpan).toBe(0);
  });
});

describe("<slot> — https://html.spec.whatwg.org/#the-slot-element", () => {
  test("assignedNodes / assignedElements follow named slot assignment", () => {
    const host = document.body.appendChild(document.createElement("div"));
    host.innerHTML = '<span slot="a">A</span>text<b>B</b>';
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<slot name="a"></slot><slot><i>fallback</i></slot>';
    const [named, def] = root.querySelectorAll("slot");
    expect(named.assignedElements().map((e: any) => e.textContent)).toEqual(["A"]);
    expect(def.assignedNodes().map((n: any) => n.textContent)).toEqual(["text", "B"]);
    host.innerHTML = "";
    expect(def.assignedNodes({ flatten: true }).map((n: any) => n.textContent)).toEqual(["fallback"]);
  });
});

describe("invokers — https://html.spec.whatwg.org/#popoverinvokerelement", () => {
  test("popovertarget toggles/shows/hides the target popover on click", () => {
    document.body.innerHTML = '<button id=b popovertarget=p>b</button><button id=h popovertarget=p popovertargetaction=hide>h</button><div popover id=p></div>';
    const p = document.getElementById("p");
    const b = document.getElementById("b");
    expect(b.popoverTargetElement).toBe(p);
    expect(b.popoverTargetAction).toBe("toggle");
    b.click();
    expect(p.matches(":popover-open")).toBe(true);
    b.click();
    expect(p.matches(":popover-open")).toBe(false);
    b.click();
    document.getElementById("h").click();
    expect(p.matches(":popover-open")).toBe(false);
  });

  test("popoverTargetElement setter uses an explicitly set element", () => {
    document.body.innerHTML = "<button id=b></button><div popover id=p></div>";
    const b = document.getElementById("b");
    const p = document.getElementById("p");
    b.popoverTargetElement = p;
    expect(b.getAttribute("popovertarget")).toBe("");
    expect(b.popoverTargetElement).toBe(p);
    b.click();
    expect(p.matches(":popover-open")).toBe(true);
  });

  test("commandfor runs built-in dialog commands after a cancelable command event", () => {
    document.body.innerHTML = '<button id=open commandfor=d command=show-modal></button><dialog id=d><button id=close commandfor=d command=close value=ok></button></dialog>';
    const d = document.getElementById("d");
    const events: string[] = [];
    d.addEventListener("command", (e: any) => events.push(e.command));
    document.getElementById("open").click();
    expect(d.matches(":modal")).toBe(true);
    document.getElementById("close").click();
    expect(d.open).toBe(false);
    expect(d.returnValue).toBe("ok");
    expect(events).toEqual(["show-modal", "close"]);
    expect(document.getElementById("open").command).toBe("show-modal");
  });

  test("a submit button inside a form does not invoke its popover target", () => {
    document.body.innerHTML = '<form><button id=b popovertarget=p>b</button></form><div popover id=p></div>';
    document.querySelector("form").addEventListener("submit", (e: any) => e.preventDefault());
    document.getElementById("b").click();
    expect(document.getElementById("p").matches(":popover-open")).toBe(false);
  });
});

describe("<object> constraint validation — https://html.spec.whatwg.org/#the-object-element", () => {
  test("never a candidate for constraint validation; setCustomValidity sets customError", () => {
    document.body.innerHTML = "<form><object></object></form>";
    const o = document.querySelector("object");
    expect(o.willValidate).toBe(false);
    expect(o.form).toBe(document.querySelector("form"));
    o.setCustomValidity("bad");
    expect(o.validity.customError).toBe(true);
    expect(o.validity.valid).toBe(false);
    expect(o.validationMessage).toBe("");
    expect(o.checkValidity()).toBe(true);
    expect(o.reportValidity()).toBe(true);
  });
});
