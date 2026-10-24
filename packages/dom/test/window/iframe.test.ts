/**
 * Minimal nested browsing contexts for <iframe>.
 *
 * Spec: HTML Standard §4.8.5 "The iframe element"
 *   https://html.spec.whatwg.org/#the-iframe-element
 *   https://html.spec.whatwg.org/#create-a-new-child-navigable
 *   https://html.spec.whatwg.org/#dom-iframe-contentwindow
 *   https://html.spec.whatwg.org/#iframe-load-event-steps
 *   https://html.spec.whatwg.org/#dom-parent, #dom-top, #dom-frameelement
 *
 * Deviation (docs/deviations.md): `src` is never fetched; the content is about:blank with the
 * document URL set to the resolved `src`.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow, currentWindowOrNull, installGlobals, type Window } from "@rtd/dom";

type Frame = HTMLElement & { contentWindow: Window | null; contentDocument: Document | null };

let window: Window;

beforeEach(() => {
  window = createWindow({ url: "http://localhost/app/" });
});

afterEach(() => {
  window.close();
  vi.useRealTimers();
});

function frame(attrs: Record<string, string> = {}): Frame {
  const el = window.document.createElement("iframe") as unknown as Frame;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe("child navigable — https://html.spec.whatwg.org/#create-a-new-child-navigable", () => {
  test("a disconnected iframe has no content window or document", () => {
    const f = frame();
    expect(f.contentWindow).toBeNull();
    expect(f.contentDocument).toBeNull();
  });

  test("insertion creates an about:blank window whose parent/top is the outer window", () => {
    const f = frame();
    window.document.body!.append(f as never);
    const inner = f.contentWindow!;
    expect(inner).toBeTruthy();
    expect(inner).not.toBe(window);
    expect(inner.document).toBe(f.contentDocument);
    expect(inner.document.URL).toBe("about:blank");
    expect(inner.document.body).toBeTruthy();
    expect(inner.document.defaultView).toBe(inner);
    expect(inner.parent).toBe(window);
    expect(inner.top).toBe(window);
    expect(inner.frameElement).toBe(f);
    expect(window.frameElement).toBeNull();
  });

  test("when the outer window is installed as a global, parent/top return that global", () => {
    const target: Record<string, unknown> = {};
    const uninstall = installGlobals(window, target);
    try {
      const f = frame();
      window.document.body!.append(f as never);
      expect(f.contentWindow!.parent).toBe(target);
      expect(f.contentWindow!.top).toBe(target);
    } finally {
      uninstall();
    }
  });

  test("the nested window never becomes the current window", () => {
    window.document.body!.append(frame() as never);
    expect(currentWindowOrNull()).toBe(window);
  });

  test("srcdoc is parsed; src is not fetched but sets the document URL", () => {
    const a = frame({ srcdoc: "<p id=x>hello</p>" });
    const b = frame({ src: "page.html" });
    window.document.body!.append(a as never, b as never);
    expect(a.contentDocument!.getElementById("x")!.textContent).toBe("hello");
    expect(a.contentDocument!.URL).toBe("about:srcdoc");
    expect(b.contentDocument!.URL).toBe("http://localhost/app/page.html");
    expect(b.contentDocument!.body!.childNodes.length).toBe(0);
  });

  test("load fires asynchronously at the iframe (https://html.spec.whatwg.org/#iframe-load-event-steps)", () => {
    vi.useFakeTimers();
    const f = frame();
    const load = vi.fn();
    f.addEventListener("load", load);
    window.document.body!.append(f as never);
    expect(load).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("removal closes the nested window; reinsertion creates a fresh one", () => {
    const f = frame();
    window.document.body!.append(f as never);
    const first = f.contentWindow!;
    f.remove();
    expect(first.closed).toBe(true);
    expect(f.contentWindow).toBeNull();
    window.document.body!.append(f as never);
    expect(f.contentWindow).not.toBe(first);
  });

  test("closing the outer window closes nested windows", () => {
    const f = frame();
    window.document.body!.append(f as never);
    const inner = f.contentWindow!;
    window.close();
    expect(inner.closed).toBe(true);
  });

  test("documents without a browsing context do not create nested ones", () => {
    const doc = window.document.implementation.createHTMLDocument("");
    const f = doc.createElement("iframe") as unknown as Frame;
    doc.body!.append(f as never);
    expect(f.contentWindow).toBeNull();
  });

  test("events in the iframe document propagate to the nested window, not the outer one", () => {
    const f = frame();
    window.document.body!.append(f as never);
    const inner = f.contentWindow!;
    const innerSpy = vi.fn();
    const outerSpy = vi.fn();
    inner.addEventListener("click", innerSpy);
    window.addEventListener("click", outerSpy);
    const button = inner.document.body!.appendChild(inner.document.createElement("button"));
    const InnerEvent = (inner as unknown as { Event: new (t: string, i: object) => never }).Event;
    button.dispatchEvent(new InnerEvent("click", { bubbles: true }));
    expect(innerSpy).toHaveBeenCalledTimes(1);
    expect(outerSpy).not.toHaveBeenCalled();
  });
});

describe("about base URL — https://html.spec.whatwg.org/#concept-document-about-base-url", () => {
  test("fallback base URL: about:blank and about:srcdoc documents use their creator's base URL", () => {
    const blank = frame();
    const srcdoc = frame({ srcdoc: "<a href=rel>x</a>" });
    window.document.body!.append(blank as never, srcdoc as never);
    expect(blank.contentDocument!.baseURI).toBe("http://localhost/app/");
    expect(srcdoc.contentDocument!.baseURI).toBe("http://localhost/app/");
    expect((srcdoc.contentDocument!.querySelector("a") as unknown as { href: string }).href).toBe("http://localhost/app/rel");
  });

  test("the about base URL is a snapshot taken at creation, not a live view of the container's base URL", () => {
    const base = window.document.createElement("base");
    base.setAttribute("href", "http://example.com/first/");
    window.document.head!.appendChild(base);
    const f = frame();
    window.document.body!.append(f as never);
    base.setAttribute("href", "http://example.com/changed/");
    expect(window.document.baseURI).toBe("http://example.com/changed/");
    expect(f.contentDocument!.baseURI).toBe("http://example.com/first/");
  });

  test("a <base> inside the nested document still wins over the about base URL", () => {
    const f = frame({ srcdoc: '<base href="http://example.org/dir/">' });
    window.document.body!.append(f as never);
    expect(f.contentDocument!.baseURI).toBe("http://example.org/dir/");
  });

  test("a src URL (not about:) is its own base URL", () => {
    const f = frame({ src: "sub/page.html" });
    window.document.body!.append(f as never);
    expect(f.contentDocument!.baseURI).toBe("http://localhost/app/sub/page.html");
  });
});
