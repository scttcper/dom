/**
 * Custom element reaction ordering, element queues, the construction stack, definition lookup and
 * valid custom element names — differential against jsdom (whose custom elements are generated
 * from the spec and pass the WPT custom-elements suite).
 *
 * Spec: HTML Standard §4.13 Custom elements
 *   - valid names:             https://html.spec.whatwg.org/#prod-potentialcustomelementname
 *   - definition lookup:       https://html.spec.whatwg.org/#look-up-a-custom-element-definition
 *   - construction stack:      https://html.spec.whatwg.org/#concept-custom-element-definition-construction-stack
 *   - reaction queues:         https://html.spec.whatwg.org/#custom-element-reaction-queue,
 *                              https://html.spec.whatwg.org/#current-element-queue,
 *                              https://html.spec.whatwg.org/#enqueue-an-element-on-the-appropriate-element-queue,
 *                              https://html.spec.whatwg.org/#backup-element-queue
 *   - ElementInternals:        https://html.spec.whatwg.org/#elementinternals
 */
import { describe } from "vitest";
import { differential, differentialAsync, type AnyWindow } from "../../src/harness.ts";

/** Defines `name` with callbacks that log into `log`. */
function logging(w: AnyWindow, name: string, log: string[], observed: string[] = ["a"]): void {
  w.customElements.define(
    name,
    class extends w.HTMLElement {
      static observedAttributes = observed;
      constructor() {
        super();
        log.push(`ctor ${name}`);
      }
      connectedCallback(this: AnyWindow) {
        log.push(`connected ${this.id || name}`);
      }
      disconnectedCallback(this: AnyWindow) {
        log.push(`disconnected ${this.id || name}`);
      }
      attributeChangedCallback(this: AnyWindow, attr: string, old: string | null, value: string | null) {
        log.push(`attr ${this.id || name} ${attr} ${old}→${value}`);
      }
    },
  );
}

describe("valid custom element names — https://html.spec.whatwg.org/#prod-potentialcustomelementname", () => {
  differential("define() accepts PCENChar names (including non-ASCII) and rejects uppercase, missing hyphens and reserved names", (w) =>
    ["x-a", "x-🙂", "x-é", "a-b-c", "x-", "X-a", "xa", "-x", "font-face", "missing-glyph", "x.y-z", "1-x"].map((n) => {
      try {
        w.customElements.define(n, class extends w.HTMLElement {});
        return "ok";
      } catch (e) {
        return (e as Error).name;
      }
    }),
  );
});

describe("look up a custom element definition — https://html.spec.whatwg.org/#look-up-a-custom-element-definition", () => {
  differential("only the HTML namespace and an exact local name find a definition; customized built-ins need is=", (w) => {
    w.customElements.define("x-look", class extends w.HTMLElement {});
    w.customElements.define("x-btn", class extends w.HTMLButtonElement {}, { extends: "button" });
    const ns = (n: string, local: string) => w.document.createElementNS(n, local).constructor.name;
    return [
      w.document.createElement("x-look").constructor.name !== "HTMLElement",
      ns("http://www.w3.org/1999/xhtml", "x-look") !== "HTMLElement",
      ns("http://www.w3.org/2000/svg", "x-look"),
      w.document.createElement("button", { is: "x-btn" }).constructor.name !== "HTMLButtonElement",
      w.document.createElement("button").constructor.name,
      w.document.createElement("x-btn").constructor.name,
    ];
  });
});

describe("the construction stack — https://html.spec.whatwg.org/#concept-custom-element-definition-construction-stack", () => {
  differential("upgrading: super() returns the element being upgraded; constructing twice throws", (w) => {
    w.document.body.innerHTML = `<x-up id=e></x-up>`;
    const existing = w.document.getElementById("e");
    const log: unknown[] = [];
    w.customElements.define(
      "x-up",
      class extends w.HTMLElement {
        constructor() {
          const self = super();
          log.push(self === existing);
          try {
            new (this.constructor as AnyWindow)();
            log.push("nested ok");
          } catch (e) {
            log.push((e as Error).name);
          }
        }
      },
    );
    return log;
  });

  differential("a constructor that returns a different object fails the upgrade and leaves the element undefined", (w) => {
    w.document.body.innerHTML = `<x-bad id=e></x-bad>`;
    const errors: string[] = [];
    w.addEventListener("error", (e: AnyWindow) => {
      errors.push(e.error?.name ?? "error");
      e.preventDefault();
    });
    w.customElements.define(
      "x-bad",
      class extends w.HTMLElement {
        constructor() {
          super();
          return w.document.createElement("div") as never;
        }
      },
    );
    const e = w.document.getElementById("e");
    return [errors, e.matches(":defined"), e instanceof w.customElements.get("x-bad")];
  }, {
    jsdomDeviation: {
      expected: [["TypeError"], false, true],
      spec: "https://html.spec.whatwg.org/#concept-upgrade-an-element (step 8 throws a TypeError; the catch step sets the custom element state to failed, which :defined does not match: https://html.spec.whatwg.org/#selector-defined)",
      reason: "jsdom leaves the element matching :defined after the failed upgrade",
    },
  });
});

describe("custom element reactions — https://html.spec.whatwg.org/#custom-element-reaction-queue", () => {
  differential("reactions enqueued during one [CEReactions] call run before it returns, element by element in queue order (https://html.spec.whatwg.org/#current-element-queue)", (w) => {
    const log: string[] = [];
    logging(w, "x-r", log);
    const host = w.document.createElement("div");
    host.innerHTML = `<x-r id=one a=1></x-r><x-r id=two></x-r>`;
    log.push("after innerHTML");
    w.document.body.appendChild(host);
    log.push("after append");
    return log;
  });

  differential("a reaction that triggers more reactions on another element is processed in the same element queue (https://html.spec.whatwg.org/#enqueue-an-element-on-the-appropriate-element-queue)", (w) => {
    const log: string[] = [];
    logging(w, "x-o", log);
    w.customElements.define(
      "x-p",
      class extends w.HTMLElement {
        connectedCallback(this: AnyWindow) {
          log.push("connected p");
          this.querySelector("x-o").setAttribute("a", "from-p");
          log.push("p done");
        }
      },
    );
    w.document.body.innerHTML = `<x-p><x-o id=o></x-o></x-p>`;
    log.push("end");
    return log;
  });

  differential("removing and re-inserting in one call queues disconnected then connected", (w) => {
    const log: string[] = [];
    logging(w, "x-m", log);
    w.document.body.innerHTML = `<div id=a><x-m id=m></x-m></div><div id=b></div>`;
    log.length = 0;
    w.document.getElementById("b").appendChild(w.document.getElementById("m"));
    return log;
  });

  differentialAsync("reactions enqueued with no [CEReactions] scope run from the backup element queue in a microtask (https://html.spec.whatwg.org/#backup-element-queue)", async (w) => {
    const log: string[] = [];
    // A customized <details> observing `open`: the summary's activation behavior sets the
    // attribute from click(), which is not [CEReactions], so attributeChangedCallback waits for
    // the backup element queue's microtask.
    w.customElements.define(
      "x-details",
      class extends w.HTMLDetailsElement {
        static observedAttributes = ["open"];
        attributeChangedCallback(attr: string, old: string | null, value: string | null) {
          log.push(`attr ${attr} ${old}→${value}`);
        }
      },
      { extends: "details" },
    );
    w.document.body.innerHTML = `<details is=x-details><summary id=s>s</summary></details>`;
    w.document.getElementById("s").click();
    log.push("after click");
    await Promise.resolve();
    log.push("after microtask");
    return log;
  });
});

describe("ElementInternals — https://html.spec.whatwg.org/#elementinternals", () => {
  differential("attachInternals once per element, only for autonomous custom elements, and not when disabled", (w) => {
    class A extends w.HTMLElement {}
    class D extends w.HTMLElement {
      static disabledFeatures = ["internals"];
    }
    w.customElements.define("x-ai", A);
    w.customElements.define("x-ad", D);
    const out: string[] = [];
    const tryAttach = (el: AnyWindow) => {
      try {
        el.attachInternals();
        return "ok";
      } catch (e) {
        return (e as Error).name;
      }
    };
    const a = new A();
    out.push(tryAttach(a), tryAttach(a), tryAttach(new D()), tryAttach(w.document.createElement("div")), tryAttach(w.document.createElement("x-undefined")));
    return out;
  });
});
