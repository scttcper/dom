/**
 * Slot assignment algorithms one by one (shadow-dom.test.ts covers the end-to-end behavior),
 * differential against jsdom for named assignment, direct against the spec for manual
 * assignment (jsdom has no slotAssignment: "manual").
 *
 * Spec: DOM Standard §4.2.2 "Shadow tree" — slots and slottables
 *   - slot name / slottable name: https://dom.spec.whatwg.org/#slot-name, https://dom.spec.whatwg.org/#slotable-name
 *   - find a slot: https://dom.spec.whatwg.org/#find-a-slot
 *   - find slottables / find flattened slottables: https://dom.spec.whatwg.org/#find-slotables
 *   - assign slottables (for a tree) / assign a slot: https://dom.spec.whatwg.org/#assign-slotables-for-a-tree
 *   - assigned nodes / assigned slot / manual slot assignment: https://dom.spec.whatwg.org/#slot-assigned-nodes
 *     (assigned slot: https://dom.spec.whatwg.org/#slotable-assigned-slot)
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { describeNode, differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

const names = (list: AnyWindow) => [...list].map((n: AnyWindow) => describeNode(n));

/** <div id=host> light children from `light`, shadow tree from `shadow`. */
function host(w: AnyWindow, light: string, shadow: string, mode: "open" | "closed" = "open") {
  const d = w.document;
  const el = d.body.appendChild(d.createElement("div"));
  el.id = "host";
  el.innerHTML = light;
  const root = el.attachShadow({ mode });
  root.innerHTML = shadow;
  return {
    d,
    el,
    root,
    slot: (name = "") => [...root.querySelectorAll("slot")].find((s: AnyWindow) => s.name === name),
  };
}

describe("slottable name and find a slot — https://dom.spec.whatwg.org/#find-a-slot", () => {
  differential(
    "elements and Text nodes are slottables; comments are not; a slottable's name is its slot attribute (https://dom.spec.whatwg.org/#slotable-name)",
    (w) => {
      const { slot } = host(
        w,
        '<b id="b"></b>text<!--c--><i id="i" slot="x"></i>',
        '<slot></slot><slot name="x"></slot>',
      );
      return { default: names(slot().assignedNodes()), x: names(slot("x").assignedNodes()) };
    },
  );

  differential("step 5: the first slot in tree order whose name matches wins; later duplicates get nothing", (w) => {
    const { root } = host(
      w,
      '<b slot="dup"></b>',
      '<p><slot name="dup" id="first"></slot></p><slot name="dup" id="second"></slot>',
    );
    return [...root.querySelectorAll("slot")].map((s: AnyWindow) => [s.id, names(s.assignedNodes())]);
  });

  differential(
    "steps 1–2: only children of a shadow host are slottable — grandchildren and nodes outside hosts have no assigned slot",
    (w) => {
      const { d, el } = host(w, '<p><b id="grand"></b></p>', "<slot></slot>");
      return [describeNode(el.firstChild.assignedSlot), d.getElementById("grand").assignedSlot, d.body.assignedSlot];
    },
  );

  differential(
    "step 3: with open false, a closed shadow root's slot is not exposed through assignedSlot (https://dom.spec.whatwg.org/#dom-slotable-assignedslot)",
    (w) => {
      const { el } = host(w, "<b></b>", "<slot></slot>", "closed");
      return el.firstChild.assignedSlot;
    },
  );

  differential(
    "the slot name is the name attribute, the empty string when absent (https://dom.spec.whatwg.org/#slot-name)",
    (w) => {
      const { el, slot } = host(w, '<b slot=""></b><i></i><u slot="n"></u>', '<slot name="n"></slot><slot></slot>');
      const before = names(slot().assignedNodes());
      slot("n").removeAttribute("name");
      return {
        before,
        afterRemovingName: [...el.shadowRoot.querySelectorAll("slot")].map((s: AnyWindow) => names(s.assignedNodes())),
      };
    },
  );

  differential("Element.slot reflects the slot attribute (https://dom.spec.whatwg.org/#dom-element-slot)", (w) => {
    const b = w.document.createElement("b");
    const before = b.slot;
    b.slot = "x";
    return [before, b.getAttribute("slot"), b.slot];
  });
});

describe("find slottables — https://dom.spec.whatwg.org/#find-slotables", () => {
  differential("assigned nodes are in the host's child order, not insertion order", (w) => {
    const { el, slot } = host(w, "", "<slot></slot>");
    const d = w.document;
    const [a, b] = [d.createElement("a"), d.createElement("b")];
    el.append(b);
    el.insertBefore(a, b);
    return names(slot().assignedNodes());
  });

  differential("assignedElements filters assigned nodes to elements; a slot outside a shadow tree has none", (w) => {
    const { d, slot } = host(w, "<b></b>text<i></i>", "<slot></slot>");
    const loose = d.createElement("slot");
    loose.append(d.createElement("span"));
    return {
      elements: names(slot().assignedElements()),
      loose: [loose.assignedNodes().length, names(loose.assignedNodes({ flatten: true }))],
    };
  });
});

describe("find flattened slottables — https://dom.spec.whatwg.org/#find-flattened-slotables", () => {
  differential("step 5: an assigned slot is replaced by its own flattened slottables (nested shadow trees)", (w) => {
    const d = w.document;
    // outer host > inner host (in outer's shadow tree) whose light child is outer's slot.
    const outer = d.body.appendChild(d.createElement("div"));
    outer.innerHTML = '<b id="x"></b>text';
    const outerRoot = outer.attachShadow({ mode: "open" });
    const innerHost = outerRoot.appendChild(d.createElement("div"));
    const passThrough = innerHost.appendChild(d.createElement("slot"));
    const innerRoot = innerHost.attachShadow({ mode: "open" });
    const innerSlot = innerRoot.appendChild(d.createElement("slot"));
    return {
      assigned: names(innerSlot.assignedNodes()),
      flattened: names(innerSlot.assignedNodes({ flatten: true })),
      passThroughSlot: describeNode(passThrough.assignedSlot),
    };
  });

  differential(
    "step 4: an empty slot flattens to its slottable children (fallback content), recursing into fallback slots",
    (w) => {
      const { slot } = host(w, "", '<slot>fallback <b>bold</b><!--c--><slot name="inner">inner fallback</slot></slot>');
      return { assigned: slot().assignedNodes().length, flattened: names(slot().assignedNodes({ flatten: true })) };
    },
  );
});

describe("assign slottables for a tree — https://dom.spec.whatwg.org/#assign-slotables-for-a-tree", () => {
  differential(
    "inserting a slot into a shadow tree assigns existing host children to it; removing it reassigns them to the next match",
    (w) => {
      const { d, el, root } = host(w, "<b></b><i slot='n'></i>", '<slot id="late-default"></slot>');
      const late = root.getElementById("late-default");
      const earlier = d.createElement("slot");
      root.prepend(earlier);
      const afterInsert = [names(earlier.assignedNodes()), names(late.assignedNodes())];
      earlier.remove();
      return { afterInsert, afterRemove: names(late.assignedNodes()), iSlot: el.lastChild.assignedSlot };
    },
  );

  differential(
    "inserting a fragment of slots assigns each in tree order (assign slottables for a tree runs over the inclusive descendants)",
    (w) => {
      const { d, root } = host(w, "<b slot='a'></b><i slot='b'></i>", "");
      const wrap = d.createElement("div");
      wrap.innerHTML = '<slot name="b"></slot><p><slot name="a"></slot></p>';
      root.append(wrap);
      return [...root.querySelectorAll("slot")].map((s: AnyWindow) => [s.name, names(s.assignedNodes())]);
    },
  );

  differential(
    "assign a slot: changing a slottable's slot attribute moves it, and the old slot loses it (https://dom.spec.whatwg.org/#assign-a-slot)",
    (w) => {
      const { el, slot } = host(w, "<b></b>", '<slot></slot><slot name="x"></slot>');
      const b = el.firstChild;
      b.slot = "x";
      const moved = [names(slot().assignedNodes()), names(slot("x").assignedNodes())];
      b.removeAttribute("slot");
      return { moved, back: [names(slot().assignedNodes()), names(slot("x").assignedNodes())] };
    },
  );
});

describe("manual slot assignment — https://dom.spec.whatwg.org/#slot-manually-assigned-nodes", () => {
  function manual() {
    const { document } = createWindow();
    const el = document.body!.appendChild(document.createElement("div"));
    el.innerHTML = '<b slot="a"></b><i></i>';
    const root = el.attachShadow({ mode: "open", slotAssignment: "manual" });
    root.innerHTML = '<slot name="a"></slot><slot id="other"></slot>';
    const [named, other] = root.querySelectorAll("slot") as unknown as [HTMLSlotLike, HTMLSlotLike];
    return {
      document,
      el,
      root,
      named,
      other,
      b: el.firstChild as unknown as SlottableLike,
      i: el.lastChild as unknown as SlottableLike,
    };
  }
  interface HTMLSlotLike {
    assign(...nodes: unknown[]): void;
    assignedNodes(o?: { flatten?: boolean }): unknown[];
    remove(): void;
  }
  interface SlottableLike {
    assignedSlot: unknown;
    slot: string;
    remove(): void;
  }

  test("find a slot step 4: in manual mode the slot attribute is ignored; only assign() assigns", () => {
    const { named, other, b, i } = manual();
    expect(named.assignedNodes()).toEqual([]);
    named.assign(i, b);
    // find slottables step 4: manually assigned nodes whose parent is the host, in assign() order.
    expect(named.assignedNodes()).toEqual([i, b]);
    expect(b.assignedSlot).toBe(named);
    expect(other.assignedNodes()).toEqual([]);
  });

  test("assign() step 1–2: a node assigned to another slot moves; reassigning replaces the whole list (https://dom.spec.whatwg.org/#slottable-manual-slot-assignment)", () => {
    const { named, other, b, i } = manual();
    named.assign(b, i);
    other.assign(b);
    expect(named.assignedNodes()).toEqual([i]);
    expect(other.assignedNodes()).toEqual([b]);
    named.assign();
    expect(named.assignedNodes()).toEqual([]);
    expect(i.assignedSlot).toBeNull();
  });

  test("manually assigned nodes that are not children of the host stay in the list but are not assigned", () => {
    const { document, named, b } = manual();
    const stranger = document.createElement("u");
    named.assign(stranger, b);
    expect(named.assignedNodes()).toEqual([b]);
    b.remove();
    expect(named.assignedNodes()).toEqual([]);
  });

  test("named mode ignores assign()'d nodes; manual is per shadow root (https://dom.spec.whatwg.org/#shadowroot-mode)", () => {
    const { document } = createWindow();
    const el = document.body!.appendChild(document.createElement("div"));
    el.innerHTML = "<b></b>";
    const root = el.attachShadow({ mode: "open" });
    expect((root as unknown as { slotAssignment: string }).slotAssignment).toBe("named");
    root.innerHTML = "<slot></slot>";
    const slot = root.firstChild as unknown as HTMLSlotLike;
    expect(slot.assignedNodes()).toEqual([el.firstChild]);
    slot.assign();
    expect(slot.assignedNodes()).toEqual([el.firstChild]);
  });
});
