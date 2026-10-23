/**
 * Focus.
 *
 * Spec: HTML Standard §6.6 "Focus"
 *   https://html.spec.whatwg.org/#focus
 *   https://html.spec.whatwg.org/#focusable-area
 *   https://html.spec.whatwg.org/#focusing-steps
 *   https://html.spec.whatwg.org/#unfocusing-steps
 *   https://html.spec.whatwg.org/#focus-update-steps
 *   https://html.spec.whatwg.org/#focus-fixup-rule
 *   https://html.spec.whatwg.org/#sequential-focus-navigation
 *   https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement
 *   https://html.spec.whatwg.org/#dom-tabindex
 * Selectors Level 4: :focus, :focus-within, :focus-visible
 *   https://drafts.csswg.org/selectors-4/#the-focus-pseudo
 *
 * Some cases port web-platform-tests html/interaction/focus/ (links inline).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@rtd/dom";
import { isFocusable, sequentialFocusOrder, matchesFocus, matchesFocusWithin } from "../../src/html/focus.ts";

let document: Document;
let doc: any;

beforeEach(() => {
  document = createWindow().document;
  doc = document;
});

function el(html: string): any {
  doc.body.innerHTML = html;
  return doc.body.firstElementChild;
}

describe("focusable area — https://html.spec.whatwg.org/#focusable-area", () => {
  test.each([
    ["<button>b</button>", true],
    ["<input>", true],
    ['<input type="hidden">', false],
    ["<select></select>", true],
    ["<textarea></textarea>", true],
    ['<a href="#x">a</a>', true],
    ["<a>no href</a>", false],
    ["<div>div</div>", false],
    ['<div tabindex="0">div</div>', true],
    ['<div tabindex="-1">div</div>', true],
    ['<div tabindex="x">invalid tabindex</div>', false],
    ["<iframe></iframe>", true],
    ['<div contenteditable="true">x</div>', true],
    ['<div contenteditable="false">x</div>', false],
    ["<video controls></video>", true],
    ["<video></video>", false],
    ["<button disabled>b</button>", false],
    ['<fieldset disabled><input></fieldset>', false],
    ["<div inert><button>b</button></div>", false],
  ])("%s → %s", (html, expected) => {
    const e = el(html);
    const target = e.localName === "fieldset" || e.localName === "div" && e.hasAttribute("inert") ? e.firstElementChild : e;
    expect(isFocusable(target._impl)).toBe(expected);
  });

  test("a disconnected element is not focusable", () => {
    const b = doc.createElement("button");
    expect(isFocusable(b._impl)).toBe(false);
    b.focus();
    expect(doc.activeElement).toBe(doc.body);
  });

  test("summary is focusable only as the first summary child of details", () => {
    const d = el("<details><summary>one</summary><summary>two</summary></details>");
    expect(isFocusable(d.children[0]._impl)).toBe(true);
    expect(isFocusable(d.children[1]._impl)).toBe(false);
  });

  test("SVG a[href] and SVG elements with tabindex are focusable", () => {
    const svg = el('<svg><a href="#x"><text>t</text></a><rect tabindex="0"></rect><circle></circle></svg>');
    expect(isFocusable(svg.children[0]._impl)).toBe(true);
    expect(isFocusable(svg.children[1]._impl)).toBe(true);
    expect(isFocusable(svg.children[2]._impl)).toBe(false);
  });
});

describe("tabIndex IDL attribute — https://html.spec.whatwg.org/#dom-tabindex", () => {
  test("default is 0 for a, area, button, frame, iframe, input, object, select, textarea and -1 otherwise", () => {
    for (const name of ["a", "area", "button", "frame", "iframe", "input", "object", "select", "textarea"]) {
      expect(doc.createElement(name).tabIndex, name).toBe(0);
    }
    for (const name of ["div", "span", "p", "summary", "dialog", "details"]) {
      expect(doc.createElement(name).tabIndex, name).toBe(-1);
    }
  });

  test("summary for its parent details defaults to 0", () => {
    const d = el("<details><summary>s</summary></details>");
    expect(d.firstElementChild.tabIndex).toBe(0);
  });

  test("reflects a valid integer and falls back to the default on invalid values", () => {
    const div = doc.createElement("div");
    div.setAttribute("tabindex", "  7");
    expect(div.tabIndex).toBe(7);
    div.setAttribute("tabindex", "foo");
    expect(div.tabIndex).toBe(-1);
    div.tabIndex = 3;
    expect(div.getAttribute("tabindex")).toBe("3");
  });

  test("SVG and MathML elements have tabIndex", () => {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(svg.tabIndex).toBe(-1);
    const a = doc.createElementNS("http://www.w3.org/2000/svg", "a");
    expect(a.tabIndex).toBe(0);
    const math = doc.createElementNS("http://www.w3.org/1998/Math/MathML", "math");
    expect(math.tabIndex).toBe(-1);
  });
});

describe("focusing steps and focus update steps — https://html.spec.whatwg.org/#focus-update-steps", () => {
  test("focus() makes the element the active element and hasFocus() true", () => {
    const b = el("<button>b</button>");
    expect(doc.activeElement).toBe(doc.body);
    expect(doc.hasFocus()).toBe(false);
    b.focus();
    expect(doc.activeElement).toBe(b);
    expect(doc.hasFocus()).toBe(true);
  });

  test("event order is blur → focusout on the old element, then focus → focusin on the new one, with relatedTarget", () => {
    doc.body.innerHTML = "<input id=a><input id=b>";
    const a = doc.getElementById("a");
    const b = doc.getElementById("b");
    a.focus();
    const log: string[] = [];
    for (const target of [a, b]) {
      for (const type of ["focus", "blur", "focusin", "focusout"]) {
        target.addEventListener(type, (e: any) => {
          log.push(`${e.type}@${e.target.id} related=${e.relatedTarget?.id ?? null} bubbles=${e.bubbles} composed=${e.composed} trusted=${e.isTrusted} active=${doc.activeElement.id || doc.activeElement.localName}`);
        });
      }
    }
    b.focus();
    expect(log).toEqual([
      "blur@a related=b bubbles=false composed=true trusted=true active=body",
      "focusout@a related=b bubbles=true composed=true trusted=true active=body",
      "focus@b related=a bubbles=false composed=true trusted=true active=b",
      "focusin@b related=a bubbles=true composed=true trusted=true active=b",
    ]);
  });

  test("focus events are FocusEvent instances", () => {
    const b = el("<button>b</button>");
    let event: any = null;
    b.addEventListener("focus", (e: any) => (event = e));
    b.focus();
    expect(event).toBeInstanceOf((doc.defaultView as any).FocusEvent);
  });

  test("focusing the already focused element fires nothing", () => {
    const b = el("<button>b</button>");
    b.focus();
    let count = 0;
    b.addEventListener("focus", () => count++);
    b.focus();
    expect(count).toBe(0);
  });

  test("focus() on a non-focusable element does nothing", () => {
    const b = el("<button>b</button>");
    b.focus();
    const div = doc.createElement("div");
    doc.body.appendChild(div);
    div.focus();
    expect(doc.activeElement).toBe(b);
  });

  test("a blur handler that moves focus elsewhere wins", () => {
    doc.body.innerHTML = "<input id=a><input id=b><input id=c>";
    const [a, b, c] = ["a", "b", "c"].map((id) => doc.getElementById(id));
    a.focus();
    a.addEventListener("blur", () => c.focus(), { once: true });
    b.focus();
    expect(doc.activeElement).toBe(c);
  });

  test("blur() runs the unfocusing steps: blur/focusout with null relatedTarget, activeElement becomes body", () => {
    const b = el("<button>b</button>");
    b.focus();
    const log: string[] = [];
    b.addEventListener("blur", (e: any) => log.push(`blur ${e.relatedTarget}`));
    b.addEventListener("focusout", (e: any) => log.push(`focusout ${e.relatedTarget}`));
    b.blur();
    expect(log).toEqual(["blur null", "focusout null"]);
    expect(doc.activeElement).toBe(doc.body);
  });

  test("blur() on an element that is not focused does nothing", () => {
    doc.body.innerHTML = "<input id=a><input id=b>";
    const a = doc.getElementById("a");
    const b = doc.getElementById("b");
    a.focus();
    b.blur();
    expect(doc.activeElement).toBe(a);
  });

  test("focus fixup: removing the focused element resets activeElement to body", () => {
    const b = el("<button>b</button>");
    b.focus();
    b.remove();
    expect(doc.activeElement).toBe(doc.body);
  });

  test("activeElement is the document element when there is no body", () => {
    doc.body.remove();
    expect(doc.activeElement).toBe(doc.documentElement);
  });

  test("click() on a disabled button does not dispatch click", () => {
    const b = el("<button disabled>b</button>");
    let clicked = false;
    b.addEventListener("click", () => (clicked = true));
    b.click();
    expect(clicked).toBe(false);
  });
});

describe(":focus and :focus-within — https://drafts.csswg.org/selectors-4/#the-focus-within-pseudo", () => {
  test("predicates track the focused element and its ancestors", () => {
    doc.body.innerHTML = "<div id=outer><div id=inner><input id=i></div></div><p id=p></p>";
    const i = doc.getElementById("i");
    i.focus();
    expect(matchesFocus(i._impl)).toBe(true);
    expect(matchesFocusWithin(doc.getElementById("outer")._impl)).toBe(true);
    expect(matchesFocusWithin(doc.getElementById("p")._impl)).toBe(false);
    expect(matchesFocus(doc.getElementById("inner")._impl)).toBe(false);
  });
});

describe("sequential focus navigation order — https://html.spec.whatwg.org/#sequential-focus-navigation-order", () => {
  test("positive tabindex first (ascending, tree order for ties), then tabindex 0 / default in tree order; negative skipped", () => {
    doc.body.innerHTML = `
      <button id=a>a</button>
      <div id=b tabindex=2>b</div>
      <input id=c tabindex=-1>
      <div id=d tabindex=1>d</div>
      <a id=e href="#">e</a>
      <span id=f tabindex=2>f</span>
      <input id=g type=hidden>
      <button id=h disabled>h</button>
      <div id=i tabindex=0>i</div>`;
    expect(sequentialFocusOrder(doc).map((e: any) => e.id)).toEqual(["d", "b", "f", "a", "e", "i"]);
  });
});

describe("modal dialogs make the rest of the document inert — https://html.spec.whatwg.org/#blocked-by-a-modal-dialog", () => {
  test("elements outside an open modal dialog are not focusable", () => {
    doc.body.innerHTML = "<button id=out>out</button><dialog id=d><button id=in>in</button></dialog>";
    const d = doc.getElementById("d");
    d.showModal();
    expect(doc.activeElement.id).toBe("in");
    expect(isFocusable(doc.getElementById("out")._impl)).toBe(false);
    d.close();
    expect(isFocusable(doc.getElementById("out")._impl)).toBe(true);
  });
});

describe("being rendered — https://html.spec.whatwg.org/#being-rendered", () => {
  test("elements that are display:none (hidden attribute, inline style, ancestors) are not focusable", () => {
    doc.body.innerHTML = '<button id=a hidden>a</button><div style="display:none"><button id=b>b</button></div><button id=c style="display: none">c</button><button id=d>d</button>';
    for (const id of ["a", "b", "c"]) {
      doc.getElementById(id).focus();
      expect(doc.activeElement, id).toBe(doc.body);
    }
    doc.getElementById("d").focus();
    expect(doc.activeElement.id).toBe("d");
  });
});

describe("delegatesFocus — https://html.spec.whatwg.org/#focus-delegate", () => {
  test("focus() on a delegating shadow host focuses its first focusable shadow descendant", () => {
    const host = doc.body.appendChild(doc.createElement("div"));
    const root = host.attachShadow({ mode: "open", delegatesFocus: true });
    root.innerHTML = "<span>x</span><input id=inner>";
    host.focus();
    expect(root.activeElement.id).toBe("inner");
    expect(doc.activeElement).toBe(host);
    expect(host.matches(":focus")).toBe(true);
    expect(matchesFocusWithin(host._impl)).toBe(true);
  });

  test("ShadowRoot.activeElement is null when focus is outside the shadow tree", () => {
    const host = doc.body.appendChild(doc.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<input>";
    const b = doc.body.appendChild(doc.createElement("button"));
    b.focus();
    expect(root.activeElement).toBeNull();
  });
});

describe("focus in nested documents — https://html.spec.whatwg.org/#focus-chain", () => {
  function setup() {
    doc.body.innerHTML = "<button id=outer>outer</button><iframe id=f></iframe>";
    const frame = doc.getElementById("f");
    const inner = frame.contentDocument;
    inner.body.innerHTML = "<button id=a>a</button><button id=b>b</button>";
    return { frame, inner, outer: doc.getElementById("outer") };
  }

  test("focusing an element in an iframe makes the iframe the parent document's active element", () => {
    const { frame, inner, outer } = setup();
    outer.focus();
    const log: string[] = [];
    outer.addEventListener("blur", () => log.push("outer blur"));
    frame.addEventListener("focus", () => log.push("iframe focus"));
    inner.getElementById("a").addEventListener("focus", () => log.push("a focus"));
    inner.getElementById("a").focus();
    expect(inner.activeElement.id).toBe("a");
    expect(doc.activeElement).toBe(frame);
    expect(inner.defaultView.frameElement).toBe(frame);
    expect(log).toEqual(["outer blur", "iframe focus", "a focus"]);
  });

  test("moving focus back to the parent document unfocuses the nested document first", () => {
    const { frame, inner, outer } = setup();
    const a = inner.getElementById("a");
    a.focus();
    const log: string[] = [];
    a.addEventListener("blur", () => log.push("a blur"));
    frame.addEventListener("blur", () => log.push("iframe blur"));
    outer.focus();
    expect(log).toEqual(["a blur", "iframe blur"]);
    expect(doc.activeElement).toBe(outer);
    expect(inner.activeElement).toBe(inner.body);
  });

  test("focus moves within the nested document without leaving the iframe focused in the parent", () => {
    const { frame, inner } = setup();
    inner.getElementById("a").focus();
    inner.getElementById("b").focus();
    expect(inner.activeElement.id).toBe("b");
    expect(doc.activeElement).toBe(frame);
    expect(sequentialFocusOrder(inner).map((e: any) => e.id)).toEqual(["a", "b"]);
  });
});
