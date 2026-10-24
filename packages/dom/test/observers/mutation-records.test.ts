/**
 * MutationObserver registration, record contents and the microtask that delivers records and
 * slotchange events. Synchronous observations go through takeRecords() and run differential
 * against jsdom; delivery timing is asserted directly against the spec steps.
 *
 * Spec: DOM Standard §4.3 "Mutation observers"
 *   - interface MutationObserver / callback / record queue: https://dom.spec.whatwg.org/#interface-mutationobserver
 *   - registered observer / registered observer list: https://dom.spec.whatwg.org/#registered-observer
 *   - node list (what disconnect walks): https://dom.spec.whatwg.org/#mutationobserver-node-list
 *   - queue a mutation record: https://dom.spec.whatwg.org/#queueing-a-mutation-record
 *   - queue a mutation observer microtask: https://dom.spec.whatwg.org/#queue-a-mutation-observer-compound-microtask
 *   - notify mutation observers: https://dom.spec.whatwg.org/#notify-mutation-observers
 *   - signal a slot change: https://dom.spec.whatwg.org/#signal-a-slot-change
 *   - interface MutationRecord: https://dom.spec.whatwg.org/#interface-mutationrecord
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, MutationObserver, type Document } from "@rtd/dom";
import { describeNode, differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

const summary = (records: AnyWindow[]) => records.map((r) => [r.type, describeNode(r.target), r.attributeName, r.oldValue]);

describe("registered observer list — https://dom.spec.whatwg.org/#registered-observer-list", () => {
  differential("observe step 7: observing the same node again replaces the registration's options instead of adding one", (w) => {
    const el = w.document.createElement("div");
    const mo = new w.MutationObserver(() => {});
    mo.observe(el, { attributes: true });
    mo.observe(el, { childList: true });
    el.setAttribute("a", "1");
    el.append("x");
    return summary(mo.takeRecords());
  });

  differential("one record per observer even when several registrations (node and ancestor) are interested; oldValue if any asks (https://dom.spec.whatwg.org/#queueing-a-mutation-record)", (w) => {
    const d = w.document;
    const parent = d.createElement("div");
    const child = parent.appendChild(d.createElement("span"));
    child.setAttribute("a", "old");
    const mo = new w.MutationObserver(() => {});
    mo.observe(parent, { attributes: true, subtree: true, attributeOldValue: true });
    mo.observe(child, { attributes: true });
    child.setAttribute("a", "new");
    return summary(mo.takeRecords());
  });

  differential("queue step 3.1–3.2: subtree: false ignores descendants; attributeFilter matches local names of null-namespace attributes only", (w) => {
    const d = w.document;
    const parent = d.createElement("div");
    const child = parent.appendChild(d.createElement("span"));
    const mo = new w.MutationObserver(() => {});
    mo.observe(parent, { attributeFilter: ["keep"], childList: true });
    child.setAttribute("keep", "1");
    child.append("x");
    parent.setAttribute("keep", "2");
    parent.setAttribute("drop", "3");
    parent.setAttributeNS("urn:x", "x:keep", "4");
    return summary(mo.takeRecords());
  }, {
    jsdomFix: {
      fix: (records) => records.slice(0, 1),
      spec: "https://dom.spec.whatwg.org/#queueing-a-mutation-record",
      reason: "step 4.2 skips an attributeFilter observer when the attribute's namespace is non-null; jsdom matches the namespaced x:keep by local name",
    },
  });

  differential("several observers on one node each get their own record object, in observer creation order of registration", (w) => {
    const el = w.document.createElement("div");
    const a = new w.MutationObserver(() => {});
    const b = new w.MutationObserver(() => {});
    b.observe(el, { attributes: true, attributeOldValue: true });
    a.observe(el, { attributes: true });
    el.setAttribute("x", "1");
    el.setAttribute("x", "2");
    const ra = a.takeRecords();
    const rb = b.takeRecords();
    return { a: summary(ra), b: summary(rb), distinct: ra[0] !== rb[0] };
  });
});

describe("MutationObserver methods — https://dom.spec.whatwg.org/#interface-mutationobserver", () => {
  differential("takeRecords returns the record queue and empties it (https://dom.spec.whatwg.org/#dom-mutationobserver-takerecords)", (w) => {
    const el = w.document.createElement("div");
    const mo = new w.MutationObserver(() => {});
    mo.observe(el, { childList: true });
    el.append("a", "b");
    el.append("c");
    const first = mo.takeRecords().length;
    return [first, mo.takeRecords().length];
  });

  differential("disconnect removes the observer from every node in its node list and empties its queue (https://dom.spec.whatwg.org/#dom-mutationobserver-disconnect)", (w) => {
    const d = w.document;
    const one = d.createElement("div");
    const two = d.createElement("div");
    const mo = new w.MutationObserver(() => {});
    mo.observe(one, { childList: true });
    mo.observe(two, { attributes: true });
    one.append("x");
    mo.disconnect();
    const afterDisconnect = mo.takeRecords().length;
    one.append("y");
    two.setAttribute("a", "1");
    const stillNone = mo.takeRecords().length;
    mo.observe(two, { attributes: true });
    two.setAttribute("a", "2");
    return [afterDisconnect, stillNone, mo.takeRecords().length];
  });

  test("the callback is invoked with (records, observer) and the observer as this (https://dom.spec.whatwg.org/#concept-mo-callback)", async () => {
    const calls: unknown[][] = [];
    const mo = new MutationObserver(function (this: unknown, records, observer) {
      calls.push([this, records.length, observer]);
    });
    const el = document.createElement("div");
    mo.observe(el, { childList: true });
    el.append("x", "y");
    el.append("z");
    await Promise.resolve();
    expect(calls).toEqual([[mo, 2, mo]]);
  });

  test("notify step 5.3: an observer whose queue was emptied by takeRecords is not called (https://dom.spec.whatwg.org/#concept-mo-queue)", async () => {
    let called = 0;
    const mo = new MutationObserver(() => called++);
    const el = document.createElement("div");
    mo.observe(el, { attributes: true });
    el.setAttribute("a", "1");
    expect(mo.takeRecords()).toHaveLength(1);
    await Promise.resolve();
    expect(called).toBe(0);
  });

  test("the constructor requires a callable callback (https://dom.spec.whatwg.org/#dom-mutationobserver-mutationobserver)", () => {
    expect(() => new MutationObserver({} as never)).toThrow(TypeError);
    expect(() => new (MutationObserver as unknown as new () => unknown)()).toThrow(TypeError);
  });
});

describe("MutationRecord — https://dom.spec.whatwg.org/#interface-mutationrecord", () => {
  differential("childList records carry static NodeLists and the siblings around the change; other fields are null", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    const [a, , c] = ["a", "b", "c"].map((t) => p.appendChild(d.createElement(t)));
    const mo = new w.MutationObserver(() => {});
    mo.observe(p, { childList: true });
    p.replaceChild(d.createElement("x"), p.childNodes[1]);
    const [r] = mo.takeRecords();
    const added = r.addedNodes;
    p.append("later");
    return {
      type: r.type,
      lists: [added instanceof w.NodeList, added.length, describeNode(added[0]), r.removedNodes.length, describeNode(r.removedNodes.item(0))],
      siblings: [r.previousSibling === a, r.nextSibling === c],
      nulls: [r.attributeName, r.attributeNamespace, r.oldValue],
      staticList: added.length,
    };
  });

  differential("attributes records carry the name and namespace; characterData records an empty node list pair", (w) => {
    const d = w.document;
    const el = d.createElement("div");
    const text = el.appendChild(d.createTextNode("t"));
    const mo = new w.MutationObserver(() => {});
    mo.observe(el, { attributes: true, characterData: true, subtree: true, characterDataOldValue: true });
    el.setAttributeNS("urn:x", "x:a", "1");
    text.data = "u";
    return mo.takeRecords().map((r: AnyWindow) => [r.type, r.attributeName, r.attributeNamespace, r.oldValue, r.addedNodes.length, r.removedNodes.length, r.previousSibling, r.nextSibling]);
  });
});

describe("delivery — https://dom.spec.whatwg.org/#queue-a-mutation-observer-compound-microtask", () => {
  test("records are delivered in one microtask queued at the first mutation, after microtasks queued before it", async () => {
    const log: string[] = [];
    const mo = new MutationObserver((records) => log.push(`mo ${records.length}`));
    const el = document.createElement("div");
    mo.observe(el, { attributes: true });
    queueMicrotask(() => log.push("before"));
    el.setAttribute("a", "1");
    queueMicrotask(() => log.push("after"));
    el.setAttribute("a", "2");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(["before", "mo 2", "after"]);
  });

  test("notify step 1 clears the queued flag: mutations made by a callback queue a new delivery, ahead of microtasks the callback queues later (https://dom.spec.whatwg.org/#mutation-observer-microtask-queued)", async () => {
    const log: string[] = [];
    const el = document.createElement("div");
    // Created first, so notified first (notify step 2: the agent's observers in creation order).
    const first = new MutationObserver((r) => {
      log.push(`first ${r.map((x) => x.attributeName).join()}`);
      if (r[0].attributeName === "a") {
        el.setAttribute("b", "1");
        queueMicrotask(() => log.push("microtask from callback"));
      }
    });
    const second = new MutationObserver((r) => log.push(`second ${r.map((x) => x.attributeName).join()}`));
    first.observe(el, { attributes: true });
    second.observe(el, { attributes: true });
    el.setAttribute("a", "1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Notify step 5 takes each observer's queue at its turn, so second already sees "b" with "a".
    expect(log).toEqual(["first a", "second a,b", "first b", "microtask from callback"]);
  });

  test("notify step 6: slotchange events fire after the observer callbacks of the same microtask, once per slot (https://dom.spec.whatwg.org/#signal-a-slot-change)", async () => {
    const log: string[] = [];
    const host = document.body!.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const named = root.appendChild(document.createElement("slot"));
    named.setAttribute("name", "n");
    const unnamed = root.appendChild(document.createElement("slot"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    named.addEventListener("slotchange", (e) => log.push(`slotchange n bubbles=${e.bubbles} composed=${e.composed}`));
    unnamed.addEventListener("slotchange", () => log.push("slotchange default"));
    const mo = new MutationObserver(() => log.push("mo"));
    mo.observe(host, { childList: true });
    const child = document.createElement("b");
    child.slot = "n";
    host.append(child, document.createElement("i"), document.createElement("i"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(["mo", "slotchange n bubbles=true composed=false", "slotchange default"]);
  });

  test("signal slots are fired in the order they were signaled and a slot is signaled once per microtask (https://dom.spec.whatwg.org/#signal-slots)", async () => {
    const log: string[] = [];
    const host = document.body!.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const a = root.appendChild(document.createElement("slot"));
    a.setAttribute("name", "a");
    const b = root.appendChild(document.createElement("slot"));
    b.setAttribute("name", "b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    a.addEventListener("slotchange", () => log.push("a"));
    b.addEventListener("slotchange", () => log.push("b"));
    const toB = document.createElement("i");
    toB.slot = "b";
    host.append(toB);
    const toA = document.createElement("i");
    toA.slot = "a";
    host.append(toA);
    toB.slot = "a";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(["b", "a"]);
  });
});
