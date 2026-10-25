/**
 * window.postMessage and the MessageEvent it delivers.
 *
 * Spec: HTML Standard §9.3 "Cross-document messaging"
 *   - postMessage(message, options):      https://html.spec.whatwg.org/#dom-window-postmessage-options
 *   - postMessage(message, targetOrigin, transfer):
 *                                         https://html.spec.whatwg.org/#dom-window-postmessage
 *   - window post message steps:          https://html.spec.whatwg.org/#window-post-message-steps
 *   - MessageEvent:                       https://html.spec.whatwg.org/#the-messageevent-interface
 *   - StructuredSerializeWithTransfer:    https://html.spec.whatwg.org/#structuredserializewithtransfer
 *
 * jsdom neither clones the message nor transfers anything, so these assert the spec directly.
 * React's scheduler and many "run after paint" helpers use postMessage / MessageChannel.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow } from "@ctrl/dom";

let window: any;

beforeEach(() => {
  vi.useFakeTimers();
  window = createWindow({ url: "https://example.com/page" });
});

afterEach(() => {
  window.close();
  vi.useRealTimers();
});

function collect(): any[] {
  const events: any[] = [];
  window.addEventListener("message", (e: any) => events.push(e));
  return events;
}

describe("window post message steps — https://html.spec.whatwg.org/#window-post-message-steps", () => {
  test("step 2: targetOrigin \"/\" means the caller's own origin", () => {
    const events = collect();
    window.postMessage("same", "/");
    vi.runAllTimers();
    expect(events.map((e) => e.data)).toEqual(["same"]);
  });

  test("step 3: a targetOrigin URL is reduced to its origin (path and query are ignored)", () => {
    const events = collect();
    window.postMessage("with path", "https://example.com/some/path?q");
    window.postMessage("other port", "https://example.com:444/");
    vi.runAllTimers();
    expect(events.map((e) => e.data)).toEqual(["with path"]);
  });

  test("the options dictionary form accepts targetOrigin (default \"/\") and transfer", () => {
    const events = collect();
    window.postMessage("default origin", {});
    window.postMessage("star", { targetOrigin: "*" });
    window.postMessage("dropped", { targetOrigin: "https://other.example" });
    vi.runAllTimers();
    expect(events.map((e) => e.data)).toEqual(["default origin", "star"]);
  });

  test("messages are delivered in posting order, each in its own task", async () => {
    vi.useRealTimers();
    const order: string[] = [];
    window.addEventListener("message", (e: any) => {
      order.push(e.data);
      queueMicrotask(() => order.push(`microtask after ${e.data}`));
    });
    window.postMessage("1", "*");
    window.postMessage("2", "*");
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["1", "microtask after 1", "2", "microtask after 2"]);
  });

  test("step 5: transferring an ArrayBuffer detaches it at the sender", () => {
    const events = collect();
    const buffer = new ArrayBuffer(8);
    window.postMessage(buffer, "*", [buffer]);
    expect(buffer.byteLength).toBe(0);
    vi.runAllTimers();
    expect(events[0].data.byteLength).toBe(8);
  });

  test("step 8.4: transferred MessagePorts are exposed as event.ports (frozen), whether or not the message references them", () => {
    const events = collect();
    const channel = new window.MessageChannel();
    window.postMessage("port", "*", [channel.port1]);
    vi.runAllTimers();
    const ports = events[0].ports;
    expect(ports).toHaveLength(1);
    expect(ports[0]).toBeInstanceOf(window.MessagePort);
    expect(ports[0]).not.toBe(channel.port1);
    expect(Object.isFrozen(ports)).toBe(true);
    channel.port2.close();
    ports[0].close();
  });

  test("a port referenced from the message is the same object as the one in event.ports", () => {
    const events = collect();
    const channel = new window.MessageChannel();
    window.postMessage({ reply: channel.port1 }, { targetOrigin: "*", transfer: [channel.port1] });
    vi.runAllTimers();
    expect(events[0].data.reply).toBe(events[0].ports[0]);
    channel.port2.close();
    events[0].ports[0].close();
  });

  test("step 8.4: a MessageEvent with the sender's origin, an empty lastEventId, no ports, not bubbling or cancelable", () => {
    const events = collect();
    window.postMessage({ x: 1 }, "*");
    vi.runAllTimers();
    const e = events[0];
    expect(e).toBeInstanceOf(window.MessageEvent);
    expect(e.type).toBe("message");
    expect(e.origin).toBe("https://example.com");
    expect(e.lastEventId).toBe("");
    expect(e.source).toBe(window);
    expect(e.ports).toEqual([]);
    expect(e.bubbles).toBe(false);
    expect(e.cancelable).toBe(false);
  });

  test("the onmessage event handler receives the event", () => {
    const handler = vi.fn();
    window.onmessage = handler;
    window.postMessage("h", "*");
    vi.runAllTimers();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("MessageEvent — https://html.spec.whatwg.org/#the-messageevent-interface", () => {
  test("constructor defaults: data null, origin and lastEventId empty, source null, ports an empty frozen array", () => {
    const e = new window.MessageEvent("message");
    expect([e.data, e.origin, e.lastEventId, e.source]).toEqual([null, "", "", null]);
    expect(e.ports).toEqual([]);
    expect(Object.isFrozen(e.ports)).toBe(true);
  });

  test("ports is the same frozen array on every read", () => {
    const channel = new window.MessageChannel();
    const e = new window.MessageEvent("message", { ports: [channel.port1] });
    expect(e.ports).toBe(e.ports);
    expect(e.ports[0]).toBe(channel.port1);
    channel.port1.close();
  });
});
