class Node {
  tag: string;
  parent: Node | null = null;
  firstChild: Node | null = null;
  lastChild: Node | null = null;
  next: Node | null = null;
  attrNames: string[] = [];
  attrValues: string[] = [];
  constructor(tag: string) {
    this.tag = tag;
  }
}
const nodes: Node[] = [];

export function noop(x: number): number {
  return x + 1;
}
export function createElement(tag: string): number {
  nodes.push(new Node(tag));
  return nodes.length - 1;
}
export function appendChild(p: number, c: number): number {
  const pn = nodes[p]!;
  const cn = nodes[c]!;
  cn.parent = pn;
  if (pn.lastChild === null) pn.firstChild = cn;
  else pn.lastChild.next = cn;
  pn.lastChild = cn;
  return c;
}
export function setAttribute(id: number, name: string, value: string): number {
  const n = nodes[id]!;
  for (let i = 0; i < n.attrNames.length; i++) {
    if (n.attrNames[i] === name) {
      n.attrValues[i] = value;
      return 0;
    }
  }
  n.attrNames.push(name);
  n.attrValues.push(value);
  return 0;
}
export function getAttribute(id: number, name: string): string {
  const n = nodes[id]!;
  for (let i = 0; i < n.attrNames.length; i++) {
    if (n.attrNames[i] === name) return n.attrValues[i]!;
  }
  return "";
}
function countIn(n: Node, tag: string): number {
  let c = n.tag === tag ? 1 : 0;
  let ch = n.firstChild;
  while (ch !== null) {
    c += countIn(ch, tag);
    ch = ch.next;
  }
  return c;
}
export function countByTag(root: number, tag: string): number {
  return countIn(nodes[root]!, tag);
}
export function reset(): number {
  nodes.length = 0;
  return 0;
}
