/**
 * Cookie domains: host-only vs domain cookies and domain-match.
 *
 * Spec: HTML Standard §3.1.3 — https://html.spec.whatwg.org/#dom-document-cookie, which defers to
 * RFC 6265:
 *   - the Domain attribute:               https://httpwg.org/specs/rfc6265.html#domain-attribute
 *   - domain-match:                       https://httpwg.org/specs/rfc6265.html#cookie-domain
 *   - storage model (steps 6 and 11):     https://httpwg.org/specs/rfc6265.html#storage-model
 *   - retrieval algorithm (step 1):       https://httpwg.org/specs/rfc6265.html#retrieval-algorithm
 *
 * The differential half (localhost only) is tests/compat/test/html/cookie.test.ts; these need
 * other hosts.
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

function win(url: string): any {
  return createWindow({ url });
}

describe("Domain attribute — https://httpwg.org/specs/rfc6265.html#storage-model", () => {
  test("step 6: a cookie whose Domain the host domain-matches is stored; another domain's is ignored", () => {
    const w = win("http://app.example.com/");
    w.document.cookie = "parent=1; Domain=example.com";
    w.document.cookie = "other=2; Domain=example.org";
    w.document.cookie = "sibling=3; Domain=api.example.com";
    expect(w.document.cookie).toBe("parent=1");
  });

  test("domain-match: a suffix match must fall on a label boundary", () => {
    const w = win("http://badexample.com/");
    w.document.cookie = "a=1; Domain=example.com";
    expect(w.document.cookie).toBe("");
  });

  test("domain-match: IP address hosts only match themselves", () => {
    const w = win("http://127.0.0.1/");
    w.document.cookie = "a=1; Domain=0.0.1";
    w.document.cookie = "b=2; Domain=127.0.0.1";
    expect(w.document.cookie).toBe("b=2");
  });
});

describe("retrieval — https://httpwg.org/specs/rfc6265.html#retrieval-algorithm", () => {
  test("step 1: host-only cookies are returned only for their exact host", () => {
    const w = win("http://example.com/");
    w.document.cookie = "hostonly=1";
    w.document.cookie = "domain=2; Domain=example.com";
    // No navigation: assigning href only changes the URL (docs/deviations.md), keeping the jar.
    w.location.href = "http://sub.example.com/";
    expect(w.document.cookie).toBe("domain=2");
    w.location.href = "http://example.com/";
    expect(w.document.cookie).toBe("hostonly=1; domain=2");
  });

  test("cookies never leak to an unrelated host", () => {
    const w = win("http://one.test/");
    w.document.cookie = "a=1";
    w.location.href = "http://two.test/";
    expect(w.document.cookie).toBe("");
  });
});
