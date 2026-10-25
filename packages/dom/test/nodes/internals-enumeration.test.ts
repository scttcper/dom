/**
 * Own enumerable keys of platform objects: nothing from @ctrl/dom's implementation state.
 *
 * Specs: WebIDL §3.7 (https://webidl.spec.whatwg.org/#es-platform-objects) — a platform object's
 * own properties are only what the spec defines (indexed/named properties, [LegacyUnforgeable]
 * attributes); DOM nodes have none. ECMAScript EnumerableOwnProperties
 * (https://tc39.es/ecma262/#sec-enumerableownproperties) backs Object.keys, for...in and
 * JSON.stringify (https://tc39.es/ecma262/#sec-serializejsonobject).
 *
 * Differential against jsdom (impl behind a symbol): Jest's --json reporter and diff walk own
 * enumerable keys, so internals must not show up (downstream/react-aria repro
 * dom-core-wrapper-internals-enumerable.test.ts).
 */
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

const HTML = `<!doctype html><html><head><style>p { color: red }</style></head><body>
  <form><input id=i value=x><select><option>a</option></select><textarea>t</textarea><button>b</button></form>
  <a href="#x">l</a><p class="c" data-x="1" style="color: blue">text<!--c--></p><template><b></b></template></body></html>`;

/** Interesting objects of a window (ctrl-dom or jsdom), each touched so lazy internals exist. */
function objects(window: any): Record<string, object> {
  const d = window.document;
  const p = d.querySelector("p");
  const input = d.querySelector("input");
  input.addEventListener("input", () => {});
  p.style.color;
  p.classList.contains("c");
  p.dataset.x;
  p.attributes.length;
  p.childNodes.length;
  p.children.length;
  const sheet = d.querySelector("style").sheet;
  return {
    document: d,
    html: d.documentElement,
    body: d.body,
    p,
    input,
    select: d.querySelector("select"),
    option: d.querySelector("option"),
    textarea: d.querySelector("textarea"),
    button: d.querySelector("button"),
    form: d.querySelector("form"),
    anchor: d.querySelector("a"),
    template: d.querySelector("template"),
    text: p.firstChild,
    comment: p.lastChild,
    fragment: d.createDocumentFragment(),
    attr: p.getAttributeNode("class"),
    style: p.style,
    classList: p.classList,
    dataset: p.dataset,
    attributes: p.attributes,
    children: p.children,
    range: d.createRange(),
    treeWalker: d.createTreeWalker(d.body),
    mutationObserver: new window.MutationObserver(() => {}),
    sheet,
    rule: sheet.cssRules[0],
    location: window.location,
    history: window.history,
    navigator: window.navigator,
  };
}

const ctrlDom = objects(createWindow({ html: HTML }));
const jsdom = objects(new JSDOM(HTML).window);

describe("EnumerableOwnProperties — https://tc39.es/ecma262/#sec-enumerableownproperties", () => {
  for (const name of Object.keys(ctrlDom)) {
    // jsdom additionally exposes [LegacyUnforgeable] members (document.location, Location's
    // members) and indexed properties of some collections as own properties; ours live on the
    // prototype or behind index getters. What matters: nothing beyond what jsdom has.
    test(`${name}: Object.keys and for...in yield no key jsdom lacks (no implementation fields)`, () => {
      const forIn = (o: object) => {
        const keys: string[] = [];
        for (const k in o) if (Object.hasOwn(o, k)) keys.push(k);
        return keys;
      };
      const allowed = new Set(Object.keys(jsdom[name]));
      expect(Object.keys(ctrlDom[name]).filter((k) => !allowed.has(k))).toEqual([]);
      expect(forIn(ctrlDom[name]).filter((k) => !allowed.has(k))).toEqual([]);
    });
  }

  test("a Window has no own enumerable implementation fields", () => {
    const window = createWindow();
    window.addEventListener("resize", () => {});
    window.requestAnimationFrame(() => {});
    window.close();
    expect(Object.keys(window).filter((k) => k.startsWith("_"))).toEqual([]);
  });
});

describe("SerializeJSONObject — https://tc39.es/ecma262/#sec-serializejsonobject", () => {
  test("JSON.stringify of an object holding connected nodes does not throw and serializes nodes as {}", () => {
    const { input, document } = ctrlDom as { input: object; document: object };
    expect(JSON.stringify({ error: { actual: input, document } })).toBe('{"error":{"actual":{},"document":{}}}');
  });
});
