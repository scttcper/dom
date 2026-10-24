/**
 * Custom elements: definition, upgrades and reaction ordering — differential against jsdom.
 *
 * Spec: HTML Standard §4.13 "Custom elements"
 *   - CustomElementRegistry.define:       https://html.spec.whatwg.org/#dom-customelementregistry-define
 *   - get / getName / whenDefined:        https://html.spec.whatwg.org/#dom-customelementregistry-get
 *                                         https://html.spec.whatwg.org/#dom-customelementregistry-getname
 *                                         https://html.spec.whatwg.org/#dom-customelementregistry-whendefined
 *   - valid custom element name:          https://html.spec.whatwg.org/#valid-custom-element-name
 *   - upgrades:                           https://html.spec.whatwg.org/#upgrades
 *   - custom element reactions:           https://html.spec.whatwg.org/#custom-element-reactions
 *   - enqueue a custom element callback reaction:
 *                                         https://html.spec.whatwg.org/#enqueue-a-custom-element-callback-reaction
 *   - CEReactions:                        https://html.spec.whatwg.org/#cereactions
 *
 * Web-component libraries (Lit, Shoelace, Stencil output) and React 19's custom element
 * support are tested on exactly these callback orders.
 */
import { describe } from "vitest";
import { differential, differentialAsync, type AnyWindow } from "../../src/harness.ts";

function errorName(fn: () => void): string {
  try {
    fn();
    return "none";
  } catch (e) {
    return (e as Error).name;
  }
}

/** Defines `name` with a class that logs every reaction into `log`. */
function defineLogging(w: AnyWindow, name: string, log: string[], observed: string[] = ["a", "b"]): AnyWindow {
  const C = class extends w.HTMLElement {
    static observedAttributes = observed;
    constructor() {
      super();
      log.push(`ctor ${this.id || "(no id)"} attrs=${this.attributes.length} parent=${this.parentNode ? this.parentNode.nodeName : "null"}`);
    }
    connectedCallback() {
      log.push(`connected ${this.id}`);
    }
    disconnectedCallback() {
      log.push(`disconnected ${this.id}`);
    }
    adoptedCallback(oldDoc: AnyWindow, newDoc: AnyWindow) {
      log.push(`adopted ${this.id} ${oldDoc === newDoc}`);
    }
    attributeChangedCallback(attr: string, oldValue: string | null, newValue: string | null, ns: string | null) {
      log.push(`attr ${this.id} ${attr} ${oldValue}->${newValue} ns=${ns}`);
    }
  };
  w.customElements.define(name, C);
  return C;
}

describe("define — https://html.spec.whatwg.org/#dom-customelementregistry-define", () => {
  differential("step 2: names that are not valid custom element names throw SyntaxError", (w) => {
    const names = ["foo", "Foo-bar", "font-face", "1x-y", "x-Y", "x-y", "x-é", "annotation-xml", "missing-glyph", "a-"];
    const out: Record<string, string> = {};
    for (const name of names) out[name] = errorName(() => w.customElements.define(name, class extends w.HTMLElement {}));
    return out;
  });

  differential("steps 3–4: a second definition of the name, or of the same constructor, throws NotSupportedError", (w) => {
    const C = class extends w.HTMLElement {};
    w.customElements.define("x-one", C);
    return {
      sameName: errorName(() => w.customElements.define("x-one", class extends w.HTMLElement {})),
      sameCtor: errorName(() => w.customElements.define("x-two", C)),
    };
  });

  differential("step 1: a non-constructor throws TypeError", (w) => ({
    arrow: errorName(() => w.customElements.define("x-arrow", (() => {}) as never)),
    object: errorName(() => w.customElements.define("x-obj", {} as never)),
  }));

  differential("observedAttributes is read once, at definition time", (w) => {
    let reads = 0;
    const log: string[] = [];
    w.customElements.define(
      "x-reads",
      class extends w.HTMLElement {
        static get observedAttributes() {
          reads++;
          return ["a"];
        }
        attributeChangedCallback(n: string) {
          log.push(n);
        }
      },
    );
    const el = w.document.createElement("x-reads");
    el.setAttribute("a", "1");
    el.setAttribute("b", "1");
    return { reads, log };
  });
});

describe("registry lookups — https://html.spec.whatwg.org/#dom-customelementregistry-get", () => {
  differential("get returns the constructor or undefined; getName the name or null", (w) => {
    const C = class extends w.HTMLElement {};
    w.customElements.define("x-get", C);
    return {
      get: w.customElements.get("x-get") === C,
      missing: w.customElements.get("x-missing") === undefined,
      getName: w.customElements.getName(C),
      getNameUnknown: w.customElements.getName(class extends w.HTMLElement {}),
    };
  });
});

describe("upgrades — https://html.spec.whatwg.org/#upgrades", () => {
  differential("define upgrades connected candidates in tree order; parsed attributes are reported before connected", (w) => {
    const log: string[] = [];
    w.document.body.innerHTML = '<x-up id=one a="1"><x-up id=two b="2"></x-up></x-up>';
    defineLogging(w, "x-up", log);
    return log;
  });

  differential("define does not upgrade disconnected elements; insertion does", (w) => {
    const log: string[] = [];
    const el = w.document.createElement("x-later");
    el.id = "later";
    defineLogging(w, "x-later", log);
    const before = [...log];
    w.document.body.appendChild(el);
    return { before, after: log };
  });

  differential("createElement of a defined name constructs synchronously (no attributes, no parent)", (w) => {
    const log: string[] = [];
    defineLogging(w, "x-sync", log);
    const el = w.document.createElement("x-sync");
    el.id = "s";
    return { log, isInstance: el instanceof w.customElements.get("x-sync") };
  });

  differential("innerHTML with a defined name: constructor, attribute changes, then connected per element", (w) => {
    const log: string[] = [];
    defineLogging(w, "x-html", log);
    w.document.body.innerHTML = '<x-html id=p a="1"><x-html id=c b="2"></x-html></x-html>';
    return log;
  });

  differential("cloneNode of a custom element constructs the clone and reports its attributes", (w) => {
    const log: string[] = [];
    defineLogging(w, "x-clone", log);
    w.document.body.innerHTML = '<x-clone id=orig a="1"></x-clone>';
    log.length = 0;
    const copy = w.document.getElementById("orig").cloneNode(true);
    return { log, upgraded: copy instanceof w.customElements.get("x-clone") };
  });

  differentialAsync("whenDefined: one pending promise per name, resolved with the constructor at define; invalid names reject", async (w) => {
    const p1 = w.customElements.whenDefined("x-when");
    const p2 = w.customElements.whenDefined("x-when");
    let settled = false;
    p1.then(() => (settled = true));
    await Promise.resolve();
    const before = settled;
    const C = class extends w.HTMLElement {};
    w.customElements.define("x-when", C);
    const value = await p1;
    return {
      samePromise: p1 === p2,
      before,
      resolvedWithCtor: value === C,
      afterDefine: (await w.customElements.whenDefined("x-when")) === C,
      invalid: await w.customElements.whenDefined("nodash").then(
        () => "resolved",
        (e: Error) => e.name,
      ),
    };
  });
});

describe("custom element reactions — https://html.spec.whatwg.org/#custom-element-reactions", () => {
  differential("attributeChangedCallback: only observed attributes, with old/new values and namespace", (w) => {
    const log: string[] = [];
    defineLogging(w, "x-attrs", log);
    const el = w.document.createElement("x-attrs");
    el.id = "e";
    el.setAttribute("a", "1");
    el.setAttribute("a", "2");
    el.setAttribute("c", "ignored");
    el.removeAttribute("a");
    el.setAttributeNS("urn:x", "p:b", "ns");
    el.toggleAttribute("b");
    return log;
  });

  differential("setting an attribute to its current value still enqueues a reaction", (w) => {
    const log: string[] = [];
    defineLogging(w, "x-same", log);
    const el = w.document.createElement("x-same");
    el.id = "e";
    el.setAttribute("a", "v");
    el.setAttribute("a", "v");
    return log;
  });

  differential("connected/disconnected on insert, move and removal; nothing for detached subtrees", (w) => {
    const log: string[] = [];
    defineLogging(w, "x-life", log);
    const el = w.document.createElement("x-life");
    el.id = "l";
    const holder = w.document.createElement("div");
    holder.appendChild(el); // detached: no reaction
    w.document.body.appendChild(holder);
    const other = w.document.body.appendChild(w.document.createElement("section"));
    other.appendChild(el); // move: disconnected then connected
    el.remove();
    return log;
  });

  differential("adoptedCallback runs when moved into another document, after disconnected and before connected", (w) => {
    const log: string[] = [];
    defineLogging(w, "x-adopt", log);
    w.document.body.innerHTML = "<x-adopt id=ad></x-adopt>";
    log.length = 0;
    const other = w.document.implementation.createHTMLDocument("");
    other.body.appendChild(w.document.getElementById("ad"));
    return log;
  });

  differential("reactions from a nested DOM call inside a callback run before the outer call returns", (w) => {
    const log: string[] = [];
    w.customElements.define(
      "x-outer",
      class extends w.HTMLElement {
        connectedCallback() {
          log.push("outer connected");
          this.appendChild(w.document.createElement("x-inner"));
          log.push("outer after append");
        }
      },
    );
    w.customElements.define(
      "x-inner",
      class extends w.HTMLElement {
        connectedCallback() {
          log.push("inner connected");
        }
      },
    );
    w.document.body.appendChild(w.document.createElement("x-outer"));
    log.push("after outer append");
    return log;
  });

  differential("a throwing constructor during upgrade leaves the element failed (not upgraded); later elements still upgrade", (w) => {
    w.document.body.innerHTML = "<x-boom id=a></x-boom><x-boom id=b></x-boom>";
    let n = 0;
    const errors: string[] = [];
    w.addEventListener("error", (e: AnyWindow) => {
      errors.push(String(e.error?.message ?? e.message));
      e.preventDefault();
    });
    const C = class extends w.HTMLElement {
      constructor() {
        super();
        if (n++ === 0) throw new Error("first fails");
      }
    };
    w.customElements.define("x-boom", C);
    return {
      a: w.document.getElementById("a") instanceof C,
      b: w.document.getElementById("b") instanceof C,
      errors,
      definedA: w.document.getElementById("a").matches(":defined"),
    };
  }, {
    jsdomFix: {
      fix: (o) => ({ ...o, definedA: false }),
      spec: "https://html.spec.whatwg.org/#concept-upgrade-an-element",
      reason: "Upgrade sets the custom element state to \"failed\" before running the constructor and leaves it there when it throws; :defined matches only \"uncustomized\" and \"custom\". jsdom still matches :defined.",
    },
  });
});
