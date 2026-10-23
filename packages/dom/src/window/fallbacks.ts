// DOMParser / XMLSerializer / Document.parseHTMLUnsafe on top of the parser area's entry
// points, and a fallback CSS namespace used until the css area exports its own.

import { Document } from "../nodes/Document.ts";
import type { Node } from "../nodes/Node.ts";
import { parseDocument, parseHTMLUnsafe, parseXML } from "../parser/index.ts";
import { serializeXML } from "../serializer/index.ts";
import { currentWindowOrNull } from "./current.ts";
import { $contentType, $impl, $url } from "../keys.ts";

const XML_TYPES = ["text/xml", "application/xml", "application/xhtml+xml", "image/svg+xml"];

/** https://html.spec.whatwg.org/#dom-domparser-parsefromstring */
export class DOMParser {
  parseFromString(string: string, type: string): Document {
    const url = currentWindowOrNull()?.document.URL ?? "about:blank";
    type = String(type);
    if (type === "text/html") {
      // Step 2.1: an HTML document without a browsing context (scripting disabled).
      const doc = Document._createHTML(null, url);
      parseDocument(String(string), doc);
      return doc;
    }
    if (!XML_TYPES.includes(type)) {
      throw new TypeError(`Failed to execute 'parseFromString' on 'DOMParser': The provided value '${type}' is not a valid enum value of type DOMParserSupportedType.`);
    }
    // Step 2.2: an XML document whose content type is `type`.
    const doc = new Document();
    doc[$contentType] = type;
    doc[$url] = url;
    parseXML(String(string), doc, type);
    return doc;
  }
}

/** https://w3c.github.io/DOM-Parsing/#the-xmlserializer-interface */
export class XMLSerializer {
  serializeToString(root: Node): string {
    return serializeXML(root[$impl], false);
  }
}

/** https://html.spec.whatwg.org/#dom-parsehtmlunsafe — installed as the static Document.parseHTMLUnsafe. */
export function documentParseHTMLUnsafe(html: string): Document {
  const doc = Document._createHTML(null, "about:blank");
  parseHTMLUnsafe(String(html), doc);
  return doc;
}

/** https://drafts.csswg.org/cssom/#serialize-an-identifier */
function escape(value: string): string {
  const s = String(value);
  const len = s.length;
  let out = "";
  const first = len > 0 ? s.charCodeAt(0) : 0;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) out += "�";
    else if ((c >= 0x01 && c <= 0x1f) || c === 0x7f) out += `\\${c.toString(16)} `;
    else if (i === 0 && c >= 0x30 && c <= 0x39) out += `\\${c.toString(16)} `;
    else if (i === 1 && c >= 0x30 && c <= 0x39 && first === 0x2d) out += `\\${c.toString(16)} `;
    else if (i === 0 && c === 0x2d && len === 1) out += "\\-";
    else if (c >= 0x80 || c === 0x2d || c === 0x5f || (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) out += s[i];
    else out += `\\${s[i]}`;
  }
  return out;
}

/** https://drafts.csswg.org/cssom/#namespacedef-css — TODO(css): replace with the css area's CSS namespace. */
export const CSS = {
  escape,
  supports(_conditionOrProperty: string, _value?: string): boolean {
    return false;
  },
};
