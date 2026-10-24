/**
 * Document object members of the HTML Standard — differential against jsdom.
 *
 * Spec: HTML Standard §3.1 "Documents"
 *   - the Document object:                https://html.spec.whatwg.org/#the-document-object
 *   - document.referrer:                  https://html.spec.whatwg.org/#dom-document-referrer
 *   - document.lastModified:              https://html.spec.whatwg.org/#dom-document-lastmodified
 *   - document.readyState:                https://html.spec.whatwg.org/#dom-document-readystate
 *   - document.domain:                    https://html.spec.whatwg.org/#dom-document-domain
 *   - page visibility:                    https://html.spec.whatwg.org/#dom-document-visibilitystate
 *                                         https://html.spec.whatwg.org/#dom-document-hidden
 *   - DOM tree accessors (head, body, images, links, forms, scripts, getElementsByName, currentScript):
 *                                         https://html.spec.whatwg.org/#dom-tree-accessors
 *   - document.location:                  https://html.spec.whatwg.org/#dom-document-location
 *
 * Analytics, visibility-aware polling hooks and tab-focus logic read these.
 */
import { describe } from "vitest";
import { describeNode, differential, type AnyWindow } from "../../src/harness.ts";

const names = (list: ArrayLike<AnyWindow>) => Array.from(list).map(describeNode);

describe("resource metadata — https://html.spec.whatwg.org/#resource-metadata-management", () => {
  // (readyState is left out: jsdom reports "loading" until a task after construction, ours is
  // always "complete"; document.domain is a member jsdom lacks.)
  differential("referrer, visibility, characterSet, compatMode and contentType", (w) => {
    const d = w.document;
    return {
      referrer: d.referrer,
      visibilityState: d.visibilityState,
      hidden: d.hidden,
      characterSet: d.characterSet,
      charset: d.charset,
      inputEncoding: d.inputEncoding,
      compatMode: d.compatMode,
      contentType: d.contentType,
      locationIsWindowLocation: d.location === w.location,
    };
  });

  differential("lastModified is the current local time as MM/DD/YYYY hh:mm:ss", (w) => {
    return /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(w.document.lastModified);
  });

  differential("documents without a browsing context: location is null", (w) => {
    const other = w.document.implementation.createHTMLDocument("t");
    return { location: other.location, readyState: other.readyState, title: other.title };
  });
});

describe("DOM tree accessors — https://html.spec.whatwg.org/#dom-tree-accessors", () => {
  differential("head and body are the html element's first head/body (or frameset) children", (w) => {
    const d = w.document;
    const html = d.documentElement;
    const frameset = d.createElement("frameset");
    const results: unknown[] = [describeNode(d.head), describeNode(d.body)];
    html.replaceChild(frameset, d.body);
    results.push(describeNode(d.body));
    html.removeChild(d.head);
    results.push(describeNode(d.head));
    return results;
  });

  differential("body setter: replaces the body, inserts when missing, and rejects non-body/frameset elements", (w) => {
    const d = w.document;
    const errors: string[] = [];
    try {
      d.body = d.createElement("div");
    } catch (e) {
      errors.push((e as Error).name);
    }
    const newBody = d.createElement("body");
    newBody.id = "nb";
    d.body = newBody;
    const replaced = describeNode(d.body);
    d.documentElement.removeChild(d.body);
    const again = d.createElement("body");
    again.id = "again";
    d.body = again;
    return { errors, replaced, inserted: describeNode(d.body), lastChild: describeNode(d.documentElement.lastChild) };
  });

  differential("images, embeds/plugins, links, forms and scripts are live collections in tree order", (w) => {
    const d = w.document;
    d.body.innerHTML = `<img id=i1><a href=x id=a1></a><a id=noHref></a><area href=y id=ar><form id=f></form><embed id=e><script id=s></script><img id=i2>`;
    const images = d.images;
    const snapshot = {
      images: names(images),
      links: names(d.links),
      forms: names(d.forms),
      scripts: names(d.scripts),
      embeds: names(d.embeds),
      plugins: names(d.plugins),
      sameObject: d.images === images,
    };
    d.body.appendChild(d.createElement("img")).id = "i3";
    return { ...snapshot, liveImages: images.length };
  });

  differential("getElementsByName matches the name attribute on any HTML element, live", (w) => {
    const d = w.document;
    d.body.innerHTML = `<input name=n id=a><div name=n id=b></div><span name=other></span>`;
    const list = d.getElementsByName("n");
    const before = names(list);
    d.body.appendChild(d.createElement("p")).setAttribute("name", "n");
    return { before, after: list.length };
  });

  differential("currentScript is null outside script execution", (w) => w.document.currentScript);
});
