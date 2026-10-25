/**
 * Shadow DOM: attaching shadow roots, slots and slot assignment, shadow-including tree
 * operations.
 *
 * Spec: DOM Standard
 *   - §4.8 Interface ShadowRoot — https://dom.spec.whatwg.org/#interface-shadowroot
 *   - attach a shadow root — https://dom.spec.whatwg.org/#concept-attach-a-shadow-root
 *   - §4.2.2.3 Finding slots and slottables — https://dom.spec.whatwg.org/#finding-slots-and-slotables
 *   - assign slottables / signal a slot change — https://dom.spec.whatwg.org/#assign-slotables
 *   - getRootNode — https://dom.spec.whatwg.org/#dom-node-getrootnode
 *   - get the parent (event path through slots) — https://dom.spec.whatwg.org/#get-the-parent
 * HTML Standard: assignedNodes()/assign() — https://html.spec.whatwg.org/#the-slot-element
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, Event, type Document, type Element } from "@ctrl/dom";
import { assignedNodes, assignManually } from "@ctrl/dom/internal";
import { $focused, $impl } from "../../src/keys.ts";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

function slotNodes(slot: Element, flatten = false) {
  return assignedNodes(slot[$impl], flatten).map((n) => n.node);
}

describe("attach a shadow root — https://dom.spec.whatwg.org/#concept-attach-a-shadow-root", () => {
  test("step 1-2: only HTML elements with a valid shadow host name (or custom element name) can host", () => {
    expect(() => document.createElement("div").attachShadow({ mode: "open" })).not.toThrow();
    expect(() => document.createElement("my-element").attachShadow({ mode: "open" })).not.toThrow();
    expect(() => document.createElement("input").attachShadow({ mode: "open" })).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    expect(() => document.createElementNS("http://www.w3.org/2000/svg", "g").attachShadow({ mode: "open" })).toThrow(
      expect.objectContaining({ name: "NotSupportedError" }),
    );
  });

  test("step 4: a second attachShadow on a non-declarative shadow host throws NotSupportedError", () => {
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" });
    expect(() => host.attachShadow({ mode: "open" })).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
  });

  test("an invalid mode is a TypeError (WebIDL enum)", () => {
    expect(() => document.createElement("div").attachShadow({ mode: "nope" as "open" })).toThrow(TypeError);
  });

  test("init members are reflected; shadowRoot is null for closed roots", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "closed", delegatesFocus: true, slotAssignment: "manual", clonable: true, serializable: true });
    expect(root.mode).toBe("closed");
    expect(root.host).toBe(host);
    expect(root.delegatesFocus).toBe(true);
    expect(root.slotAssignment).toBe("manual");
    expect(root.clonable).toBe(true);
    expect(root.serializable).toBe(true);
    expect(host.shadowRoot).toBeNull();
    const open = document.createElement("span");
    expect(open.attachShadow({ mode: "open" })).toBe(open.shadowRoot);
  });

  test("a clonable shadow root is cloned with its host (https://dom.spec.whatwg.org/#concept-node-clone)", () => {
    const host = document.createElement("div");
    host.attachShadow({ mode: "open", clonable: true }).innerHTML = "<b>inner</b>";
    const copy = host.cloneNode(false) as Element;
    expect(copy.shadowRoot?.innerHTML).toBe("<b>inner</b>");
    const plain = document.createElement("div");
    plain.attachShadow({ mode: "open" });
    expect((plain.cloneNode(true) as Element).shadowRoot).toBeNull();
  });
});

describe("shadow-including connectedness and roots — https://dom.spec.whatwg.org/#connected", () => {
  test("nodes in a shadow tree are connected iff the host is", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const inner = root.appendChild(document.createElement("p"));
    expect(inner.isConnected).toBe(false);
    document.body!.appendChild(host);
    expect(root.isConnected).toBe(true);
    expect(inner.isConnected).toBe(true);
    host.remove();
    expect(inner.isConnected).toBe(false);
  });

  test("getRootNode() stops at the shadow root; {composed: true} crosses to the document", () => {
    const host = document.body!.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "closed" });
    const inner = root.appendChild(document.createElement("p"));
    expect(inner.getRootNode()).toBe(root);
    expect(inner.getRootNode({ composed: true })).toBe(document);
  });

  test("ShadowRoot.innerHTML parses in the context of the host", () => {
    const root = document.createElement("div").attachShadow({ mode: "open" });
    root.innerHTML = "<span>a</span>b";
    expect(root.childNodes.length).toBe(2);
    expect(root.innerHTML).toBe("<span>a</span>b");
  });

  test("ShadowRoot.activeElement is the focused element retargeted to the shadow tree (https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement)", () => {
    const host = document.body!.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const button = root.appendChild(document.createElement("button"));
    expect(root.activeElement).toBeNull();
    (document as unknown as { [$focused]: unknown })[$focused] = button[$impl];
    expect(root.activeElement).toBe(button);
  });
});

describe("slot assignment — https://dom.spec.whatwg.org/#assign-slotables", () => {
  function setup() {
    const host = document.body!.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const named = root.appendChild(document.createElement("slot"));
    named.setAttribute("name", "title");
    const fallback = root.appendChild(document.createElement("slot"));
    return { host, root, named, fallback };
  }

  test("find a slot: a slottable goes to the first slot whose name equals its slot attribute", () => {
    const { host, named, fallback } = setup();
    const title = host.appendChild(document.createElement("h1"));
    title.setAttribute("slot", "title");
    const text = host.appendChild(document.createTextNode("body text"));
    expect(slotNodes(named)).toEqual([title]);
    expect(slotNodes(fallback)).toEqual([text]);
    expect(title.assignedSlot).toBe(named);
    expect((text as unknown as { assignedSlot: Element }).assignedSlot).toBe(fallback);
  });

  test("changing the slot / name attributes reassigns (attribute change steps)", () => {
    const { host, named, fallback } = setup();
    const el = host.appendChild(document.createElement("span"));
    expect(slotNodes(fallback)).toEqual([el]);
    el.setAttribute("slot", "title");
    expect(slotNodes(named)).toEqual([el]);
    expect(slotNodes(fallback)).toEqual([]);
    named.setAttribute("name", "other");
    expect(slotNodes(named)).toEqual([]);
    expect(el.assignedSlot).toBeNull();
  });

  test("removing a slottable or the slot updates assignments", () => {
    const { host, root, fallback } = setup();
    const el = host.appendChild(document.createElement("span"));
    el.remove();
    expect(slotNodes(fallback)).toEqual([]);
    host.appendChild(el);
    fallback.remove();
    expect(el.assignedSlot).toBeNull();
    root.appendChild(fallback);
    expect(el.assignedSlot).toBe(fallback);
  });

  test("assignedSlot is null for slots in closed shadow roots (find a slot with open flag)", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    const slot = root.appendChild(document.createElement("slot"));
    const el = host.appendChild(document.createElement("span"));
    expect(slotNodes(slot)).toEqual([el]);
    expect(el.assignedSlot).toBeNull();
  });

  test("flattened assigned nodes fall back to the slot's children and recurse into nested slots", () => {
    const { named } = setup();
    const fallbackChild = named.appendChild(document.createTextNode("default"));
    expect(slotNodes(named)).toEqual([]);
    expect(slotNodes(named, true)).toEqual([fallbackChild]);
  });

  test("manual slot assignment uses assign() (https://html.spec.whatwg.org/#dom-slot-assign)", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open", slotAssignment: "manual" });
    const slot = root.appendChild(document.createElement("slot"));
    const a = host.appendChild(document.createElement("a"));
    expect(slotNodes(slot)).toEqual([]);
    assignManually(slot[$impl], [a[$impl]]);
    expect(slotNodes(slot)).toEqual([a]);
  });

  test("signal a slot change fires slotchange (bubbling) at the slot in the mutation observer microtask", async () => {
    const { host, fallback } = setup();
    const events: string[] = [];
    fallback.addEventListener("slotchange", (e) => events.push(`${e.type}:${(e as Event).bubbles}`));
    host.appendChild(document.createElement("span"));
    host.appendChild(document.createElement("span"));
    expect(events).toEqual([]);
    await Promise.resolve();
    expect(events).toEqual(["slotchange:true"]);
  });

  test("get the parent: events from a slotted node propagate through its assigned slot", () => {
    const { host, root, fallback } = setup();
    const el = host.appendChild(document.createElement("span"));
    const path: string[] = [];
    for (const t of [el, fallback, root, host]) {
      t.addEventListener("ping", () => path.push(t === root ? "#shadow-root" : (t as Element).localName));
    }
    el.dispatchEvent(new Event("ping", { bubbles: true, composed: true }));
    expect(path).toEqual(["span", "slot", "#shadow-root", "div"]);
  });
});
