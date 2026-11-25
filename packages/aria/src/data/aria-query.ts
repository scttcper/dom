// aria-query-shaped data maps (`roles`, `elementRoles`, `roleElements`, `aria`, `dom`) with
// aria-query@5.3.0's map API: `get`, `has`, `keys()` / `values()` / `entries()` returning
// arrays, `forEach(fn, thisArg)` and iteration. Data is parsed lazily on first access.
//
// Spec background: https://www.w3.org/TR/wai-aria-1.2/#role_definitions
// Source data: aria-query (Apache-2.0), see ./aria-query.generated.ts.

import { ARIA_QUERY_DATA } from "./aria-query.generated.ts";

export interface ARIARoleRelationConcept {
  name: string;
  attributes?: Array<{ name: string; value?: string | number; constraints?: string[] }>;
  constraints?: string[];
}

export interface ARIARoleDefinition {
  abstract: boolean;
  accessibleNameRequired: boolean;
  baseConcepts: Array<{ module?: string; concept?: ARIARoleRelationConcept }>;
  childrenPresentational: boolean;
  nameFrom?: string[];
  prohibitedProps: string[];
  props: Record<string, unknown>;
  relatedConcepts: Array<{ module?: string; concept?: ARIARoleRelationConcept }>;
  requireContextRole: string[];
  requiredContextRole: string[];
  requiredOwnedElements: string[][];
  requiredProps: Record<string, unknown>;
  superClass: string[][];
}

type Relation = ARIARoleDefinition["relatedConcepts"][number];
/** A `{ concept, module }` relation as `[concept, module]`, with a `{ name }`-only concept as the name. */
type PackedRelation = Relation | [concept: string | ARIARoleRelationConcept, module: string];

/**
 * A role definition as the generator stores it. `flags`: 1 abstract, 2 accessibleNameRequired,
 * 4 childrenPresentational. `nameFrom`, `superClass` and `props` are indexes into the shared
 * `lists`; a `props` list holds the indexes of its keys in `aria`, and `propValues` the props
 * whose value is not null. `baseConcepts` is always empty and `requireContextRole` equals
 * `requiredContextRole` in 5.3.0 (the generator checks both).
 */
type RawRole = [
  name: string,
  flags: number,
  nameFrom: number,
  prohibitedProps: string[],
  props: number,
  relatedConcepts: PackedRelation[],
  requiredContextRole: string[],
  requiredOwnedElements: string[][],
  requiredProps: Record<string, unknown>,
  superClass: number,
  propValues?: Record<string, unknown>,
];

interface Data {
  roles: Array<[string, ARIARoleDefinition]>;
  elementRoles: Array<[ARIARoleRelationConcept, string[]]>;
  roleElements: Array<[string, ARIARoleRelationConcept[]]>;
  aria: Array<[string, Record<string, unknown>]>;
  dom: Array<[string, { reserved: boolean }]>;
}

let built: Data | null = null;
function data(): Data {
  return (built ??= build());
}

/** Expands the compact tables of ./aria-query.generated.ts into aria-query's. */
function build(): Data {
  const {
    lists,
    roles: rawRoles,
    aria,
    dom: rawDom,
  } = JSON.parse(ARIA_QUERY_DATA) as {
    lists: unknown[][];
    roles: RawRole[];
    aria: Data["aria"];
    dom: string[];
  };
  const propsTemplates: Array<Record<string, unknown>> = [];
  const roles: Data["roles"] = new Array(rawRoles.length);
  // https://github.com/A11yance/aria-query/blob/v5.3.0/src/elementRoleMap.js and
  // roleElementMap.js: the HTML-module concepts of each role. elementRoleMap.js looks for an
  // existing entry by comparing [concept, roles] tuples with the concept itself, which never
  // matches, so every concept gets its own entry with that one role.
  const elementRoles: Data["elementRoles"] = [];
  const roleElements: Data["roleElements"] = [];
  for (let i = 0; i < rawRoles.length; i++) {
    const r = rawRoles[i];
    const name = r[0];
    // A role gets a copy of the props object of an earlier role with the same keys and no
    // values, or one parsed from its key list (JSON.parse builds fast-mode objects, much
    // faster than adding the keys one by one).
    let props: Record<string, unknown>;
    const template = propsTemplates[r[4]];
    if (template !== undefined) {
      props = { ...template };
    } else {
      const keys = lists[r[4]] as number[];
      let json = "{";
      for (let k = 0; k < keys.length; k++) json += `${k === 0 ? '"' : ',"'}${aria[keys[k]][0]}":null`;
      props = JSON.parse(`${json}}`) as Record<string, unknown>;
      if (r[10] === undefined) propsTemplates[r[4]] = props;
    }
    if (r[10] !== undefined) Object.assign(props, r[10]);
    const related = r[5];
    const relatedConcepts: Relation[] = new Array(related.length);
    const concepts: ARIARoleRelationConcept[] = [];
    for (let j = 0; j < related.length; j++) {
      const packed = related[j];
      const relation = Array.isArray(packed)
        ? { concept: typeof packed[0] === "string" ? { name: packed[0] } : packed[0], module: packed[1] }
        : packed;
      relatedConcepts[j] = relation;
      if (relation.module === "HTML" && relation.concept != null) {
        elementRoles.push([relation.concept, [name]]);
        concepts.push(relation.concept);
      }
    }
    if (concepts.length > 0) roleElements.push([name, concepts]);
    const flags = r[1];
    roles[i] = [
      name,
      {
        abstract: (flags & 1) !== 0,
        accessibleNameRequired: (flags & 2) !== 0,
        baseConcepts: [],
        childrenPresentational: (flags & 4) !== 0,
        nameFrom: (lists[r[2]] as string[]).slice(),
        prohibitedProps: r[3],
        props,
        relatedConcepts,
        requireContextRole: r[6],
        requiredContextRole: r[6].slice(),
        requiredOwnedElements: r[7],
        requiredProps: r[8],
        superClass: (lists[r[9]] as string[][]).map((chain) => chain.slice()),
      },
    ];
  }
  const dom: Data["dom"] = new Array(rawDom.length);
  for (let i = 0; i < rawDom.length; i++) {
    const name = rawDom[i];
    dom[i] = name[0] === "!" ? [name.slice(1), { reserved: true }] : [name, { reserved: false }];
  }
  return { roles, elementRoles, roleElements, aria, dom };
}

/** Deep equality for plain JSON values (aria-query uses dequal/lite for elementRoles lookups). */
function dequal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!dequal(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.hasOwn(b, k) || !dequal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
      return false;
  }
  return true;
}

/** aria-query's TLookup map interface. */
export class AriaQueryMap<K, V> {
  #entries: () => Array<[K, V]>;
  #find: (entries: Array<[K, V]>, key: K) => [K, V] | undefined;
  #index: Map<unknown, [K, V]> | null = null;

  constructor(entries: () => Array<[K, V]>, find?: (entries: Array<[K, V]>, key: K) => [K, V] | undefined) {
    this.#entries = entries;
    this.#find =
      find ??
      ((entries, key) => {
        if (this.#index === null) {
          this.#index = new Map();
          for (const e of entries) this.#index.set(e[0], e);
        }
        return this.#index.get(key);
      });
  }

  entries(): Array<[K, V]> {
    return this.#entries();
  }
  forEach(fn: (value: V, key: K, entries: Array<[K, V]>) => void, thisArg: unknown = null): void {
    const entries = this.#entries();
    for (const [key, value] of entries) fn.call(thisArg, value, key, entries);
  }
  get(key: K): V | undefined {
    return this.#find(this.#entries(), key)?.[1];
  }
  has(key: K): boolean {
    return this.#find(this.#entries(), key) !== undefined;
  }
  keys(): K[] {
    return this.#entries().map(([k]) => k);
  }
  values(): V[] {
    return this.#entries().map(([, v]) => v);
  }
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.#entries()[Symbol.iterator]();
  }
}

/** `aria-query`'s `roles`: role name → role definition. */
export const roles = new AriaQueryMap<string, ARIARoleDefinition>(() => data().roles);

/** `aria-query`'s `elementRoles`: HTML element concept → roles (looked up by name + deep-equal attributes). */
export const elementRoles = new AriaQueryMap<ARIARoleRelationConcept, string[]>(
  () => data().elementRoles,
  (entries, key) =>
    entries.find(([concept]) => key.name === concept.name && dequal(key.attributes, concept.attributes)),
);

/** `aria-query`'s `roleElements`: role → HTML element concepts. */
export const roleElements = new AriaQueryMap<string, ARIARoleRelationConcept[]>(() => data().roleElements);

/** `aria-query`'s `aria`: aria-* property → definition. */
export const aria = new AriaQueryMap<string, Record<string, unknown>>(() => data().aria);

/** `aria-query`'s `dom`: element name → definition. */
export const dom = new AriaQueryMap<string, Record<string, unknown>>(() => data().dom);

/** Whether `role`'s definition supports the given state/property (`roles.get(role)?.props[prop] !== undefined`). */
export function roleSupportsProp(role: string, prop: string): boolean {
  const def = roles.get(role);
  return def !== undefined && def.props[prop] !== undefined;
}

/** Element local names that can carry `role` implicitly (`roleElements.get(role)` names), for query pre-filters. */
export function implicitRoleElementNames(role: string): string[] {
  const concepts = roleElements.get(role);
  if (concepts === undefined) return [];
  const names = new Set<string>();
  for (const c of concepts) names.add(c.name);
  return [...names];
}

/**
 * All superclass roles of `role` (transitively, nearest first), from aria-query's
 * `superClass` chains. E.g. `checkbox` → input, widget, roletype, ...
 */
export function superClassRoles(role: string): string[] {
  const def = roles.get(role);
  if (def === undefined) return [];
  const out: string[] = [];
  for (const chain of def.superClass) {
    for (let i = chain.length - 1; i >= 0; i--) if (!out.includes(chain[i])) out.push(chain[i]);
  }
  return out;
}
