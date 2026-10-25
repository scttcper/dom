// Minimal XPath evaluator for the expressions used by the ported upstream tests
// (`div/span[2]/text()`, `//input[@value="a"]`, `.//text()`, `form/*[2]`, `//body`, ...).
// Supports: relative and absolute paths, `//` (descendant-or-self), `.`, name tests, `*`,
// `text()`, `comment()`, and predicates `[n]`, `[@attr]` (1-based position among the step's matches per context
// node) and `[@attr="value"]`. Returns the first match in document order, or null.

type N = {
  nodeType: number
  nodeName: string
  childNodes: ArrayLike<N>
  ownerDocument: N | null
  getAttribute?(name: string): string | null
}

function children(n: N): N[] {
  return Array.from(n.childNodes)
}

function descendantsOrSelf(n: N, out: N[]): N[] {
  out.push(n)
  for (const c of children(n)) descendantsOrSelf(c, out)
  return out
}

function matchesTest(n: N, test: string): boolean {
  if (test === 'text()') return n.nodeType === 3
  if (test === 'comment()') return n.nodeType === 8
  if (test === 'node()') return true
  if (n.nodeType !== 1) return false
  return test === '*' || n.nodeName.toLowerCase() === test.toLowerCase()
}

function applyPredicates(nodes: N[], predicates: string[]): N[] {
  let result = nodes
  for (const p of predicates) {
    if (/^\d+$/.test(p)) {
      const n = result[Number(p) - 1]
      result = n ? [n] : []
    } else {
      const m = /^@([\w-]+)(?:\s*=\s*["']([^"']*)["'])?$/.exec(p)
      if (!m) throw new Error(`unsupported XPath predicate [${p}]`)
      result = result.filter(n => {
        if (n.nodeType !== 1) return false
        const v = n.getAttribute?.(m[1]) ?? null
        return m[2] === undefined ? v !== null : v === m[2]
      })
    }
  }
  return result
}

export function evaluateXPath(xpath: string, context: unknown): N | null {
  const ctx = context as N
  let current: N[]
  let rest = xpath.trim()
  if (rest.startsWith('//')) {
    const doc = ctx.nodeType === 9 ? ctx : (ctx.ownerDocument as N)
    current = descendantsOrSelf(doc, [])
    rest = rest.slice(2)
  } else if (rest.startsWith('.//')) {
    current = descendantsOrSelf(ctx, [])
    rest = rest.slice(3)
  } else if (rest.startsWith('/')) {
    current = [ctx.nodeType === 9 ? ctx : (ctx.ownerDocument as N)]
    rest = rest.slice(1)
  } else {
    current = [ctx]
  }

  const steps = rest.split(/(\/\/?)/)
  let descendant = false
  for (const raw of steps) {
    if (raw === '/') continue
    if (raw === '//') {
      descendant = true
      continue
    }
    if (raw === '' || raw === '.') continue
    const m = /^([^[]+)((?:\[[^\]]+\])*)$/.exec(raw)
    if (!m) throw new Error(`unsupported XPath step "${raw}"`)
    const test = m[1]
    const predicates = [...m[2].matchAll(/\[([^\]]+)\]/g)].map(x => x[1])
    const next: N[] = []
    for (const n of current) {
      const candidates = descendant
        ? descendantsOrSelf(n, []).slice(1)
        : children(n)
      for (const c of applyPredicates(
        candidates.filter(c => matchesTest(c, test)),
        predicates,
      )) {
        if (!next.includes(c)) next.push(c)
      }
    }
    current = next
    descendant = false
  }
  return current[0] ?? null
}
