/**
 * Custom elements.
 *
 * Spec: HTML Standard §4.13 "Custom elements"
 *   https://html.spec.whatwg.org/#custom-elements
 *   https://html.spec.whatwg.org/#customelementregistry
 *   https://html.spec.whatwg.org/#html-element-constructors
 *   https://html.spec.whatwg.org/#concept-upgrade-an-element
 *   https://html.spec.whatwg.org/#custom-element-reactions
 *   https://html.spec.whatwg.org/#valid-custom-element-name
 *   https://html.spec.whatwg.org/#selector-defined
 *
 * Several cases port web-platform-tests custom-elements/ (links inline); the WPT helper
 * `define_new_custom_element` (custom-elements/resources/custom-elements-helpers.js) is
 * re-implemented below with the same log format.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { isDefined } from "../../src/html/custom-elements.ts";
import { $impl } from "../../src/keys.ts";

let window: any;
let document: any;
let customElements: any;
let HTMLElement: any;

beforeEach(() => {
  window = createWindow();
  document = window.document;
  customElements = window.customElements;
  HTMLElement = window.HTMLElement;
});

let counter = 1;

/** Port of WPT define_new_custom_element(). */
function defineNew(observedAttributes: string[] = []) {
  let log: any[] = [];
  const name = "custom-element-" + counter++;
  class CustomElement extends HTMLElement {
    static observedAttributes = observedAttributes;
    constructor() {
      super();
      log.push({ type: "constructed", element: this });
    }
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null, namespace: string | null) {
      log.push({ type: "attributeChanged", element: this, name, oldValue, newValue, namespace });
    }
    connectedCallback() {
      log.push({ type: "connected", element: this });
    }
    disconnectedCallback() {
      log.push({ type: "disconnected", element: this });
    }
  }
  customElements.define(name, CustomElement);
  return {
    name,
    class: CustomElement,
    takeLog() {
      const current = log;
      log = [];
      return current;
    },
    types() {
      return this.takeLog().map((e: any) => e.type);
    },
  };
}

describe("CustomElementRegistry.define — https://html.spec.whatwg.org/#dom-customelementregistry-define", () => {
  // Ported from WPT custom-elements/CustomElementRegistry.html
  test("step 1: a non-constructor throws TypeError", () => {
    expect(() => customElements.define("a-b", () => {})).toThrow(TypeError);
    expect(() => customElements.define("a-b", {})).toThrow(TypeError);
  });

  test.each(["a", "A-B", "1-a", "a-B", "annotation-xml", "font-face", "missing-glyph", "a_b", "-a"])(
    "step 2: invalid name %s throws SyntaxError",
    (name) => {
      expect(() => customElements.define(name, class extends HTMLElement {})).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    },
  );

  test.each(["a-b", "a-", "my-el", "x-é", "a.-b", "a-\u{10000}"])("valid name %s is accepted", (name) => {
    expect(() => customElements.define(name, class extends HTMLElement {})).not.toThrow();
  });

  test("steps 3–4: reusing a name or a constructor throws NotSupportedError", () => {
    class A extends HTMLElement {}
    customElements.define("dup-a", A);
    expect(() => customElements.define("dup-a", class extends HTMLElement {})).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    expect(() => customElements.define("dup-b", A)).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
  });

  test("step 5: extends must be a known non-custom HTML element", () => {
    expect(() => customElements.define("ext-a", class extends HTMLElement {}, { extends: "my-thing" })).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    expect(() => customElements.define("ext-b", class extends HTMLElement {}, { extends: "bogus" })).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
  });

  test("step 7: lifecycle callbacks are read from the prototype and must be callable", () => {
    class Bad extends HTMLElement {}
    (Bad.prototype as any).connectedCallback = 1;
    expect(() => customElements.define("bad-cb", Bad)).toThrow(TypeError);
  });

  test("get / getName", () => {
    class A extends HTMLElement {}
    expect(customElements.get("get-a")).toBeUndefined();
    customElements.define("get-a", A);
    expect(customElements.get("get-a")).toBe(A);
    expect(customElements.getName(A)).toBe("get-a");
    expect(customElements.getName(class {})).toBeNull();
  });

  test("whenDefined resolves with the constructor; rejects invalid names", async () => {
    const p = customElements.whenDefined("later-el");
    class L extends HTMLElement {}
    customElements.define("later-el", L);
    await expect(p).resolves.toBe(L);
    await expect(customElements.whenDefined("nodash")).rejects.toMatchObject({ name: "SyntaxError" });
    await expect(customElements.whenDefined("later-el")).resolves.toBe(L);
  });

  test("window.customElements is a per-window CustomElementRegistry", () => {
    expect(customElements).toBeInstanceOf(window.CustomElementRegistry);
    expect(window.customElements).toBe(customElements);
    expect(createWindow().customElements).not.toBe(customElements);
  });
});

describe("HTML element constructors — https://html.spec.whatwg.org/#html-element-constructors", () => {
  // Ported from WPT custom-elements/HTMLElement-constructor.html
  test("new HTMLElement() and built-in interfaces throw TypeError (Illegal constructor)", () => {
    expect(() => new HTMLElement()).toThrow(TypeError);
    expect(() => new window.HTMLDivElement()).toThrow(TypeError);
  });

  test("an undefined subclass throws TypeError", () => {
    class X extends HTMLElement {}
    expect(() => new X()).toThrow(TypeError);
  });

  test("new on a defined autonomous custom element creates it in the window's document", () => {
    class Y extends HTMLElement {}
    customElements.define("new-y", Y);
    const y = new Y();
    expect(y.localName).toBe("new-y");
    expect(y.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(y.ownerDocument).toBe(document);
    expect(y).toBeInstanceOf(HTMLElement);
    expect(y.isConnected).toBe(false);
    expect(isDefined((y as any)[$impl])).toBe(true);
  });

  test("step 4: an autonomous definition whose class extends a built-in other than HTMLElement throws", () => {
    class D extends window.HTMLDivElement {}
    customElements.define("bad-div", D);
    expect(() => new D()).toThrow(TypeError);
  });

  test("customized built-in: new creates the extended element with an is value", () => {
    class B extends window.HTMLParagraphElement {}
    customElements.define("fancy-p", B, { extends: "p" });
    const b = new B();
    expect(b.localName).toBe("p");
    expect(b).toBeInstanceOf(window.HTMLParagraphElement);
  });
});

describe("create an element (synchronous custom elements flag) — https://dom.spec.whatwg.org/#concept-create-element", () => {
  test("createElement constructs a defined element synchronously", () => {
    const ce = defineNew();
    const el = document.createElement(ce.name);
    expect(el).toBeInstanceOf(ce.class);
    expect(ce.types()).toEqual(["constructed"]);
  });

  test("createElement with { is } creates a customized built-in", () => {
    class Q extends window.HTMLQuoteElement {}
    customElements.define("my-quote", Q, { extends: "blockquote" });
    const el = document.createElement("blockquote", { is: "my-quote" });
    expect(el).toBeInstanceOf(Q);
  });

  test("a constructor that throws yields an HTMLUnknownElement and reports the error", () => {
    class Boom extends HTMLElement {
      constructor() {
        super();
        throw new Error("boom");
      }
    }
    customElements.define("boom-el", Boom);
    const errors: unknown[] = [];
    window.addEventListener("error", (e: any) => {
      errors.push(e.error);
      e.preventDefault();
    });
    const el = document.createElement("boom-el");
    expect(el).toBeInstanceOf(window.HTMLUnknownElement);
    expect(el.localName).toBe("boom-el");
    expect(errors).toHaveLength(1);
  });

  test("elements created in a document without a browsing context are not upgraded", () => {
    const ce = defineNew();
    const doc = document.implementation.createHTMLDocument("");
    const el = doc.createElement(ce.name);
    expect(el).not.toBeInstanceOf(ce.class);
    expect(isDefined(el[$impl])).toBe(false);
  });
});

describe("upgrades — https://html.spec.whatwg.org/#concept-upgrade-an-element", () => {
  test("define() upgrades existing elements in the document, in tree order", () => {
    document.body.innerHTML = "<up-a id=one x=1></up-a><div><up-a id=two></up-a></div>";
    const log: string[] = [];
    class U extends HTMLElement {
      static observedAttributes = ["x"];
      constructor() {
        super();
        log.push("ctor " + this.id);
      }
      attributeChangedCallback(n: string, o: string | null, v: string | null) {
        log.push(`attr ${this.id} ${n} ${o} ${v}`);
      }
      connectedCallback() {
        log.push("connected " + this.id);
      }
    }
    const one = document.getElementById("one");
    expect(isDefined(one[$impl])).toBe(false);
    customElements.define("up-a", U);
    expect(one).toBeInstanceOf(U);
    expect(isDefined(one[$impl])).toBe(true);
    expect(log).toEqual(["ctor one", "attr one x null 1", "connected one", "ctor two", "connected two"]);
  });

  test("disconnected undefined elements are upgraded when inserted into the document", () => {
    const ce = defineNew();
    const div = document.createElement("div");
    div.appendChild(document.createElement("x-later"));
    const el = div.firstChild;
    customElements.define("x-later", class extends HTMLElement {});
    expect(el).not.toBeInstanceOf(customElements.get("x-later"));
    document.body.appendChild(div);
    expect(el).toBeInstanceOf(customElements.get("x-later"));
    expect(ce.types()).toEqual([]);
  });

  // https://html.spec.whatwg.org/#create-an-element-for-the-token: fragment parsing creates a
  // defined custom element with an upgrade reaction (synchronous custom elements flag unset).
  test("innerHTML on a disconnected element upgrades defined custom elements at the end of the call", () => {
    const ce = defineNew();
    const div = document.createElement("div");
    div.innerHTML = `<${ce.name}></${ce.name}>`;
    expect(div.firstChild).toBeInstanceOf(ce.class);
    expect(ce.types()).toEqual(["constructed"]);
    document.body.appendChild(div);
    expect(ce.types()).toEqual(["connected"]);
  });

  test("customElements.upgrade() upgrades disconnected trees", () => {
    const ce = defineNew();
    const div = document.createElement("div");
    div.innerHTML = `<${ce.name}></${ce.name}>`;
    customElements.upgrade(div);
    expect(div.firstChild).toBeInstanceOf(ce.class);
    expect(ce.types()).toEqual(["constructed"]);
  });

  test("a constructor returning a different object fails the upgrade", () => {
    document.body.innerHTML = "<odd-el></odd-el>";
    class Odd extends HTMLElement {
      constructor() {
        super();
        return {} as any;
      }
    }
    window.addEventListener("error", (e: any) => e.preventDefault());
    customElements.define("odd-el", Odd);
    expect(isDefined(document.body.firstChild[$impl])).toBe(false);
  });

  test("properties set before the upgrade shadow class accessors (as in browsers)", () => {
    document.body.innerHTML = "<prop-el></prop-el>";
    const el = document.body.firstChild;
    el.value = "own";
    class P extends HTMLElement {
      get value() {
        return "accessor";
      }
    }
    customElements.define("prop-el", P);
    expect(el.value).toBe("own");
  });
});

describe("custom element reactions — https://html.spec.whatwg.org/#custom-element-reactions", () => {
  // Ported from WPT custom-elements/attribute-changed-callback.html
  test("setAttribute and removeAttribute enqueue attributeChangedCallback", () => {
    const ce = defineNew(["title", "id", "r"]);
    const el = document.createElement(ce.name);
    ce.takeLog();
    el.setAttribute("title", "foo");
    expect(ce.takeLog()).toEqual([expect.objectContaining({ type: "attributeChanged", name: "title", oldValue: null, newValue: "foo", namespace: null })]);
    el.removeAttribute("title");
    expect(ce.takeLog()).toEqual([expect.objectContaining({ name: "title", oldValue: "foo", newValue: null })]);
  });

  test("setAttributeNS passes the namespace", () => {
    const ce = defineNew(["title"]);
    const el = document.createElement(ce.name);
    ce.takeLog();
    el.setAttributeNS("http://www.w3.org/2000/svg", "title", "hello");
    expect(ce.takeLog()).toEqual([expect.objectContaining({ name: "title", newValue: "hello", namespace: "http://www.w3.org/2000/svg" })]);
  });

  test("unobserved attributes do not enqueue callbacks", () => {
    const ce = defineNew(["title"]);
    const el = document.createElement(ce.name);
    ce.takeLog();
    el.setAttribute("data-x", "1");
    el.id = "z";
    expect(ce.takeLog()).toEqual([]);
  });

  // Ported from WPT custom-elements/connected-callbacks.html / disconnected-callbacks.html
  test("connected/disconnected run on insertion into and removal from a document, not a detached tree", () => {
    const ce = defineNew();
    const el = document.createElement(ce.name);
    const detached = document.createElement("div");
    ce.takeLog();
    detached.appendChild(el);
    expect(ce.types()).toEqual([]);
    document.body.appendChild(detached);
    expect(ce.types()).toEqual(["connected"]);
    detached.remove();
    expect(ce.types()).toEqual(["disconnected"]);
  });

  test("moving a connected element disconnects then reconnects it", () => {
    const ce = defineNew();
    const el = document.body.appendChild(document.createElement(ce.name));
    const other = document.body.appendChild(document.createElement("div"));
    ce.takeLog();
    other.appendChild(el);
    expect(ce.types()).toEqual(["disconnected", "connected"]);
  });

  test("callbacks run after the DOM operation completes: connectedCallback may mutate the tree", () => {
    class Filler extends HTMLElement {
      connectedCallback() {
        this.innerHTML = "<span id=inner>filled</span>";
      }
    }
    customElements.define("filler-el", Filler);
    const host = document.createElement("div");
    host.innerHTML = "<filler-el></filler-el><filler-el></filler-el>";
    document.body.appendChild(host);
    expect(host.innerHTML).toBe('<filler-el><span id="inner">filled</span></filler-el><filler-el><span id="inner">filled</span></filler-el>');
    expect(document.getElementById("inner")).toBe(host.firstChild.firstChild);
    host.firstChild.remove();
    expect(document.getElementById("inner")).toBe(host.firstChild.firstChild);
  });

  test("an exception in a callback is reported and does not break the DOM operation", () => {
    class Thrower extends HTMLElement {
      connectedCallback() {
        throw new Error("nope");
      }
    }
    customElements.define("thrower-el", Thrower);
    const errors: unknown[] = [];
    window.addEventListener("error", (e: any) => {
      errors.push(e.error);
      e.preventDefault();
    });
    const el = document.createElement("thrower-el");
    expect(() => document.body.appendChild(el)).not.toThrow();
    expect(el.isConnected).toBe(true);
    expect(errors).toHaveLength(1);
  });
});

describe(":defined — https://html.spec.whatwg.org/#selector-defined", () => {
  test("built-ins and defined custom elements match, undefined custom elements do not", () => {
    document.body.innerHTML = "<div></div><later-x></later-x>";
    expect(document.querySelector("div:defined")).not.toBeNull();
    expect(document.querySelector("later-x:defined")).toBeNull();
    expect(document.querySelector("later-x:not(:defined)")).not.toBeNull();
    customElements.define("later-x", class extends HTMLElement {});
    expect(document.querySelector("later-x:defined")).not.toBeNull();
  });
});

describe("ElementInternals — https://html.spec.whatwg.org/#dom-attachinternals", () => {
  test("attachInternals works once on autonomous custom elements only", () => {
    class I extends HTMLElement {}
    customElements.define("int-el", I);
    const el = new I();
    const internals = el.attachInternals();
    expect(internals).toBeInstanceOf(window.ElementInternals);
    expect(() => el.attachInternals()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    expect(() => document.createElement("div").attachInternals()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    internals.states.add("--busy");
    expect(internals.states.has("--busy")).toBe(true);
    internals.role = "button";
    expect(internals.role).toBe("button");
  });

  test("disabledFeatures = ['internals'] disables attachInternals", () => {
    class N extends HTMLElement {
      static disabledFeatures = ["internals"];
    }
    customElements.define("noint-el", N);
    expect(() => new N().attachInternals()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
  });
});
