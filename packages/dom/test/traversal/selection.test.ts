/**
 * Selection and live-range bookkeeping beyond the WPT range suites.
 *
 * Spec:
 *   - Selection API — https://w3c.github.io/selection-api/#selection-interface
 *   - live ranges — https://dom.spec.whatwg.org/#concept-live-range
 *   - Range.toString — https://dom.spec.whatwg.org/#dom-range-stringifier
 *   - createContextualFragment — https://html.spec.whatwg.org/#dom-range-createcontextualfragment
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, installGlobals, Range, StaticRange, type Document } from "@ctrl/dom";
import { VirtualClock, installClock } from "@ctrl/dom/internal";
import { liveRangeCount } from "../../src/traversal/live.ts";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

describe("Selection — https://w3c.github.io/selection-api/#selection-interface", () => {
  test("selectionchange is a task that runs before a 0 ms timer set after the change, also on a clock that skips idle time (https://w3c.github.io/selection-api/#scheduling-selectionhange-event)", async () => {
    for (const skip of [false, true]) {
      const window = createWindow();
      // A scratch global with the window installed and its timers on the clock, as in the environments.
      const g = { Date, performance } as unknown as Record<PropertyKey, unknown>;
      const uninstallGlobals = installGlobals(window, g);
      const clock = installClock(new VirtualClock({ skip }), g);
      const setTimeout = g.setTimeout as (callback: () => void, ms: number) => unknown;
      try {
        const doc = window.document;
        const log: string[] = [];
        doc.addEventListener("selectionchange", () => log.push("selectionchange"));
        doc.body!.innerHTML = "<p>hi</p>";
        // A few rounds (each a change: select, then clear): on the skipping clock a real timer lost
        // this race only some of the time.
        for (let round = 0; round < 5; round++) {
          if (round % 2 === 0) doc.getSelection()!.selectAllChildren(doc.body!);
          else doc.getSelection()!.removeAllRanges();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          log.push("timer");
        }
        expect({ skip, log }).toEqual({ skip, log: Array(5).fill(["selectionchange", "timer"]).flat() });
      } finally {
        clock.uninstall();
        uninstallGlobals();
        window.close();
      }
    }
  });

  test("getSelection() returns one Selection per document, initially empty", () => {
    const sel = document.getSelection()!;
    expect(sel).toBe(document.getSelection());
    expect(sel.rangeCount).toBe(0);
    expect(sel.type).toBe("None");
    expect(sel.anchorNode).toBeNull();
    expect(() => sel.getRangeAt(0)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
  });

  test("collapse / extend / setBaseAndExtent maintain anchor, focus and direction", () => {
    document.body!.innerHTML = "<p>hello world</p>";
    const text = document.body!.firstChild!.firstChild!;
    const sel = document.getSelection()!;
    sel.collapse(text, 5);
    expect(sel.type).toBe("Caret");
    expect(sel.isCollapsed).toBe(true);
    sel.extend(text, 0);
    expect(sel.anchorOffset).toBe(5);
    expect(sel.focusOffset).toBe(0);
    expect(sel.direction).toBe("backward");
    expect(sel.toString()).toBe("hello");
    sel.setBaseAndExtent(text, 6, text, 11);
    expect(sel.toString()).toBe("world");
    expect(sel.direction).toBe("forward");
    expect(sel.getRangeAt(0).startOffset).toBe(6);
  });

  test("addRange keeps the same Range object (live), removeAllRanges clears", () => {
    document.body!.innerHTML = "<p>abc</p>";
    const p = document.body!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = document.getSelection()!;
    sel.addRange(range);
    expect(sel.getRangeAt(0)).toBe(range);
    expect(sel.containsNode(p.firstChild!)).toBe(true);
    sel.removeAllRanges();
    expect(sel.rangeCount).toBe(0);
  });

  test("selectAllChildren / deleteFromDocument / collapseToEnd", () => {
    document.body!.innerHTML = "<div><b>x</b>y</div>";
    const div = document.body!.firstChild!;
    const sel = document.getSelection()!;
    sel.selectAllChildren(div);
    expect(sel.toString()).toBe("xy");
    sel.deleteFromDocument();
    expect(div.childNodes.length).toBe(0);
    sel.collapseToEnd();
    expect(sel.isCollapsed).toBe(true);
  });

  test("nodes outside the document are ignored by collapse()", () => {
    const sel = document.getSelection()!;
    sel.collapse(document.createElement("div"), 0);
    expect(sel.rangeCount).toBe(0);
  });
});

describe("live ranges — https://dom.spec.whatwg.org/#concept-live-range", () => {
  test("boundary points follow insertions, removals and data changes", () => {
    document.body!.innerHTML = "<p>abcdef</p>";
    const p = document.body!.firstChild!;
    const text = p.firstChild as unknown as {
      data: string;
      insertData(o: number, d: string): void;
      splitText(o: number): unknown;
    };
    const range = document.createRange();
    range.setStart(text as never, 2);
    range.setEnd(text as never, 4);
    text.insertData(0, "XX");
    expect([range.startOffset, range.endOffset]).toEqual([4, 6]);
    text.splitText(5);
    expect(range.endContainer).toBe(p.childNodes[1]);
    expect(range.endOffset).toBe(1);
    document.body!.removeChild(p);
    expect(range.startContainer).toBe(document.body);
    expect(range.collapsed).toBe(true);
  });

  test("ranges are registered per document, so other documents' mutations do not scan them", () => {
    const before = liveRangeCount;
    const other = createWindow().document;
    const r = other.createRange();
    expect(liveRangeCount).toBe(before + 1);
    document.body!.append("x");
    expect(r.startContainer).toBe(other);
  });

  test("StaticRange is not live and validates its containers", () => {
    const text = document.createTextNode("abc");
    const s = new StaticRange({ startContainer: text, startOffset: 1, endContainer: text, endOffset: 2 });
    text.data = "";
    expect(s.startOffset).toBe(1);
    expect(
      () => new StaticRange({ startContainer: document.doctype!, startOffset: 0, endContainer: text, endOffset: 0 }),
    ).toThrow(expect.objectContaining({ name: "InvalidNodeTypeError" }));
  });

  test("toString, createContextualFragment, zero geometry", () => {
    document.body!.innerHTML = "<p>one <b>two</b> three</p>";
    const range = new Range();
    range.selectNodeContents(document.body!.firstChild!);
    expect(range.toString()).toBe("one two three");
    const frag = range.createContextualFragment("<i>x</i>");
    expect(frag.firstChild!.nodeName).toBe("I");
    expect(range.getBoundingClientRect().width).toBe(0);
  });
});
