// The page when a test failed, as indented HTML for the failure's `page.html` attachment: readable
// in Sentry's attachment viewer, and read through standard DOM properties alone, so it works on
// jsdom, happy-dom and @ctrl/dom alike. <style> and <script> contents are left out (CSS-in-JS
// fills them with kilobytes of rules), and so are comments.

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const SKIP_CONTENT = new Set(["style", "script", "template"]);

interface DomNode {
  nodeType: number;
  localName?: string;
  data?: string;
  attributes?: { length: number; [index: number]: { name: string; value: string } };
  childNodes?: { length: number; [index: number]: DomNode };
}

/** `document.body` as indented HTML, cut at `max` characters; undefined without a body. */
export function pageHtml(document: unknown, max = 200_000): string | undefined {
  const body = (document as { body?: DomNode | null } | null | undefined)?.body;
  if (body == null) return undefined;
  const lines: string[] = [];
  let size = 0;
  const push = (line: string): boolean => {
    lines.push(line);
    size += line.length + 1;
    return size < max;
  };

  const write = (node: DomNode, depth: number): boolean => {
    const indent = "  ".repeat(depth);
    if (node.nodeType === 3) {
      const text = (node.data ?? "").replace(/\s+/g, " ").trim();
      return text === "" || push(indent + escapeText(text));
    }
    if (node.nodeType !== 1 || node.localName === undefined) return true;
    const open = `<${node.localName}${attributes(node)}`;
    if (VOID.has(node.localName)) return push(`${indent}${open} />`);
    const children = SKIP_CONTENT.has(node.localName) ? [] : childList(node);
    // An element holding only a short text stays on one line: <button>Save</button>.
    if (children.length === 0) return push(`${indent}${open}></${node.localName}>`);
    if (children.length === 1 && children[0].nodeType === 3) {
      const text = (children[0].data ?? "").replace(/\s+/g, " ").trim();
      if (text.length <= 80) return push(`${indent}${open}>${escapeText(text)}</${node.localName}>`);
    }
    if (!push(`${indent}${open}>`)) return false;
    for (const child of children) if (!write(child, depth + 1)) return false;
    return push(`${indent}</${node.localName}>`);
  };

  try {
    if (!write(body, 0)) lines.push("<!-- truncated -->");
  } catch {
    return undefined;
  }
  return lines.join("\n");
}

function childList(node: DomNode): DomNode[] {
  const out: DomNode[] = [];
  const list = node.childNodes;
  if (list === undefined) return out;
  for (let i = 0; i < list.length; i++) if (list[i].nodeType === 1 || list[i].nodeType === 3) out.push(list[i]);
  return out;
}

function attributes(node: DomNode): string {
  const list = node.attributes;
  if (list === undefined) return "";
  let out = "";
  for (let i = 0; i < list.length; i++)
    out += ` ${list[i].name}="${list[i].value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`;
  return out;
}

function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
