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

interface RawData {
  roles: Array<[string, ARIARoleDefinition]>;
  elementRoles: Array<[ARIARoleRelationConcept, string[]]>;
  roleElements: Array<[string, ARIARoleRelationConcept[]]>;
  aria: Array<[string, Record<string, unknown>]>;
  dom: Array<[string, Record<string, unknown>]>;
}

let raw: RawData | null = null;
function data(): RawData {
  return (raw ??= JSON.parse(ARIA_QUERY_DATA) as RawData);
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
