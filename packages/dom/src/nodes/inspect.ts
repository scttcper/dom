// `util.inspect` / `console.log` output for nodes.
// https://nodejs.org/api/util.html#utilinspectcustom
//
// OWNER: dom-core. Prints one short line per node (never the `_impl` graph, which is huge and
// circular): `HTMLDivElement <div id="app" class="x">`, `#text "hello"`, `#document`, ...

import {
  ATTRIBUTE_NODE,
  CDATA_SECTION_NODE,
  COMMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_TYPE_NODE,
  ELEMENT_NODE,
  F_SHADOW_ROOT,
  PROCESSING_INSTRUCTION_NODE,
  TEXT_NODE,
} from "./constants.ts";
import type { NodeImpl } from "./NodeImpl.ts";

const MAX_TEXT = 60;
const MAX_ATTR = 40;

function quote(s: string, max: number): string {
  const t = s.length > max ? s.slice(0, max) + "…" : s;
  return JSON.stringify(t);
}

function ctorName(impl: NodeImpl): string {
  const c = (impl.node as { constructor?: { name?: string } }).constructor;
  return c?.name ?? "Node";
}

export function inspectNode(impl: NodeImpl, _depth?: number, _options?: unknown, _inspect?: unknown): string {
  switch (impl.type) {
    case ELEMENT_NODE: {
      const qname = impl.prefix === null ? impl.name : impl.prefix + ":" + impl.name;
      let s = ctorName(impl) + " <" + qname;
      const attrs = impl.attrs;
      if (attrs !== null) {
        for (let i = 0; i < attrs.length; i++) s += " " + attrs[i].name + "=" + quote(attrs[i].value, MAX_ATTR);
      }
      return s + (impl.first === null ? " />" : ">");
    }
    case TEXT_NODE:
      return "#text " + quote(impl.data, MAX_TEXT);
    case CDATA_SECTION_NODE:
      return "#cdata-section " + quote(impl.data, MAX_TEXT);
    case COMMENT_NODE:
      return "#comment " + quote(impl.data, MAX_TEXT);
    case PROCESSING_INSTRUCTION_NODE:
      return "ProcessingInstruction <?" + impl.name + " " + impl.data.slice(0, MAX_TEXT) + "?>";
    case DOCUMENT_NODE:
      return "#document " + quote((impl.node as unknown as { URL: string }).URL ?? "", 80);
    case DOCUMENT_TYPE_NODE:
      return "<!DOCTYPE " + impl.name + ">";
    case DOCUMENT_FRAGMENT_NODE:
      if ((impl.flags & F_SHADOW_ROOT) !== 0) {
        return "#shadow-root (" + (impl.node as unknown as { mode: string }).mode + ")";
      }
      return "#document-fragment (" + impl.childCount + (impl.childCount === 1 ? " child)" : " children)");
    case ATTRIBUTE_NODE: {
      const qname = impl.prefix === null ? impl.name : impl.prefix + ":" + impl.name;
      return "Attr " + qname + "=" + quote((impl.node as unknown as { value: string }).value, MAX_ATTR);
    }
  }
  return ctorName(impl);
}
