/**
 * Location and fragment navigation.
 *
 * Spec: HTML Standard §7.2.4 "The Location interface"
 *   https://html.spec.whatwg.org/#the-location-interface
 * and the parts of "Navigating across documents" that apply without loading documents:
 *   https://html.spec.whatwg.org/#navigate
 *   https://html.spec.whatwg.org/#scroll-to-fragid (hashchange)
 *
 * Deviation (docs/deviations.md): navigations never load a document; they only update the
 * document URL and the session history.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow, type Window } from "@ctrl/dom";

let window: Window;

beforeEach(() => {
  window = createWindow({ url: "https://example.com:8443/path/page.html?q=1#top" });
});

afterEach(() => {
  window.close();
  vi.useRealTimers();
});

describe("Location getters — https://html.spec.whatwg.org/#the-location-interface", () => {
  test("URL components reflect the document URL", () => {
    const { location } = window;
    expect(location.href).toBe("https://example.com:8443/path/page.html?q=1#top");
    expect(location.origin).toBe("https://example.com:8443");
    expect(location.protocol).toBe("https:");
    expect(location.host).toBe("example.com:8443");
    expect(location.hostname).toBe("example.com");
    expect(location.port).toBe("8443");
    expect(location.pathname).toBe("/path/page.html");
    expect(location.search).toBe("?q=1");
    expect(location.hash).toBe("#top");
  });

  test("stringifier returns href", () => {
    expect(String(window.location)).toBe(window.location.href);
    expect(`${window.location}`).toBe(window.location.href);
  });

  test("window.location and document.location are the same object", () => {
    expect(window.location).toBe(window.location);
    expect(window.document.location).toBe(window.location);
  });

  test("document.URL follows location changes", () => {
    window.location.pathname = "/other";
    expect(window.document.URL).toBe("https://example.com:8443/other?q=1#top");
  });

  test("default window URL is http://localhost/", () => {
    expect(createWindow().location.href).toBe("http://localhost/");
  });
});

describe("Location setters — https://html.spec.whatwg.org/#dom-location-href", () => {
  test("href setter resolves relative URLs against the document URL", () => {
    window.location.href = "../x?y#z";
    expect(window.location.href).toBe("https://example.com:8443/x?y#z");
  });

  test("href setter with an unparsable URL throws SyntaxError", () => {
    expect(() => {
      window.location.href = "http://[bad";
    }).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });

  test("search setter replaces the query", () => {
    window.location.search = "a=b";
    expect(window.location.search).toBe("?a=b");
    expect(window.location.hash).toBe("#top");
  });

  test("protocol setter ignores non-HTTP(S) schemes (step 6)", () => {
    window.location.protocol = "ftp";
    expect(window.location.protocol).toBe("https:");
  });

  test("hostname and port setters update the URL", () => {
    window.location.hostname = "example.org";
    window.location.port = "9000";
    expect(window.location.host).toBe("example.org:9000");
  });

  test("assign() pushes a history entry, replace() does not", () => {
    window.location.assign("/a");
    expect(window.history.length).toBe(2);
    window.location.replace("/b");
    expect(window.history.length).toBe(2);
    expect(window.location.pathname).toBe("/b");
  });

  test("reload() does nothing", () => {
    window.location.reload();
    expect(window.location.href).toBe("https://example.com:8443/path/page.html?q=1#top");
  });

  test("window.location = url navigates", () => {
    (window as unknown as { location: string }).location = "/assigned";
    expect(window.location.pathname).toBe("/assigned");
  });
});

describe("fragment navigation — https://html.spec.whatwg.org/#scroll-to-fragid", () => {
  test("hash setter strips a leading # and fires hashchange asynchronously", async () => {
    const events: { oldURL: string; newURL: string }[] = [];
    window.addEventListener("hashchange", (e) => events.push(e as never));
    window.location.hash = "#section";
    expect(window.location.hash).toBe("#section");
    expect(events).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 5));
    expect(events).toHaveLength(1);
    expect(events[0].oldURL).toBe("https://example.com:8443/path/page.html?q=1#top");
    expect(events[0].newURL).toBe("https://example.com:8443/path/page.html?q=1#section");
  });

  test("hash setter with the same fragment is a no-op (step 6)", () => {
    const before = window.history.length;
    window.location.hash = "top";
    expect(window.history.length).toBe(before);
  });

  test("hashchange tasks run on the host's (fakeable) timers", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    window.addEventListener("hashchange", spy);
    window.location.hash = "next";
    expect(spy).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("onhashchange event handler attribute receives the event", () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    (window as unknown as { onhashchange: unknown }).onhashchange = handler;
    window.location.hash = "h";
    vi.runAllTimers();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("non-fragment navigations do not fire hashchange", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    window.addEventListener("hashchange", spy);
    window.location.assign("/elsewhere#top");
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("navigate to a fragment — https://html.spec.whatwg.org/#navigate-fragid", () => {
  test("update document for history step application step 6.3: popstate fires synchronously with the new entry's null state", () => {
    window.history.replaceState({ old: true }, "");
    const order: string[] = [];
    window.addEventListener("popstate", (e) =>
      order.push(`popstate:${JSON.stringify((e as unknown as { state: unknown }).state)}:${window.location.hash}`),
    );
    window.addEventListener("hashchange", () => order.push("hashchange"));
    window.location.hash = "next";
    order.push("after setter");
    expect(order).toEqual(["popstate:null:#next", "after setter"]);
    expect(window.history.state).toBeNull();
  });

  test("step 6.3.5: hashchange is queued after popstate only when the fragment changed", () => {
    vi.useFakeTimers();
    const order: string[] = [];
    window.addEventListener("popstate", () => order.push("popstate"));
    window.addEventListener("hashchange", () => order.push("hashchange"));
    // Navigating to the current URL (fragment included) is a replacing fragment navigation.
    window.location.href = window.location.href;
    vi.runAllTimers();
    expect(order).toEqual(["popstate"]);
    window.location.replace("#other");
    vi.runAllTimers();
    expect(order).toEqual(["popstate", "popstate", "hashchange"]);
  });

  test("navigations that change more than the fragment fire neither popstate nor hashchange", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    window.addEventListener("popstate", spy);
    window.addEventListener("hashchange", spy);
    window.location.assign("/elsewhere#x");
    window.location.search = "?z=1";
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
  });

  test("activating a same-document fragment link fires popstate then hashchange", () => {
    vi.useFakeTimers();
    const order: string[] = [];
    window.addEventListener("popstate", () => order.push("popstate"));
    window.addEventListener("hashchange", () => order.push("hashchange"));
    const a: any = window.document.body!.appendChild(window.document.createElement("a"));
    a.setAttribute("href", "#link");
    a.click();
    vi.runAllTimers();
    expect(window.location.hash).toBe("#link");
    expect(order).toEqual(["popstate", "hashchange"]);
  });
});
