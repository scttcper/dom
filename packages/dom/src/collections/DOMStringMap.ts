// https://html.spec.whatwg.org/#domstringmap (element.dataset)
//
// OWNER: dom-core. DOMStringMap's whole API is named properties on arbitrary keys
// ([LegacyOverrideBuiltIns]), so this is the one collection that is necessarily a Proxy. It
// is created lazily on the first `dataset` read; elements whose dataset is never touched pay
// nothing.

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { findAttributeByNamespace, isValidAttributeLocalName, removeAttributeRecord, setAttribute } from "../nodes/attributes.ts";

/** camelCase property name → `data-*` attribute name (set/delete conversion). */
function toAttributeName(name: string): string {
  let out = "data-";
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c >= 65 && c <= 90) out += "-" + String.fromCharCode(c + 32);
    else out += name[i];
  }
  return out;
}

/** `data-*` attribute local name → camelCase property name, or null if it does not map. */
function toPropertyName(localName: string): string | null {
  if (!localName.startsWith("data-")) return null;
  let out = "";
  for (let i = 5; i < localName.length; i++) {
    const c = localName.charCodeAt(i);
    if (c >= 65 && c <= 90) return null;
    if (c === 0x2d && i + 1 < localName.length) {
      const d = localName.charCodeAt(i + 1);
      if (d >= 97 && d <= 122) {
        out += String.fromCharCode(d - 32);
        i++;
        continue;
      }
    }
    out += localName[i];
  }
  return out;
}

/** https://html.spec.whatwg.org/#dom-domstringmap-nameditem — the value for `name`, or undefined. */
function getNamed(el: NodeImpl, name: string): string | undefined {
  const attrs = el.attrs;
  if (attrs === null) return undefined;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.ns === null && toPropertyName(a.localName) === name) return a.value;
  }
  return undefined;
}

function supportedNames(el: NodeImpl): string[] {
  const out: string[] = [];
  const attrs = el.attrs;
  if (attrs === null) return out;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.ns !== null) continue;
    const p = toPropertyName(a.localName);
    if (p !== null) out.push(p);
  }
  return out;
}

/** https://html.spec.whatwg.org/#dom-domstringmap-setitem */
function setNamed(el: NodeImpl, name: string, value: string): void {
  for (let i = 0; i < name.length - 1; i++) {
    const d = name.charCodeAt(i + 1);
    if (name.charCodeAt(i) === 0x2d && d >= 97 && d <= 122) {
      throw new DOMException(`'${name}' is not a valid property name.`, "SyntaxError");
    }
  }
  const attrName = toAttributeName(name);
  if (!isValidAttributeLocalName(attrName)) {
    throw new DOMException(`'${attrName}' is not a valid attribute name.`, "InvalidCharacterError");
  }
  setAttribute(el, attrName, value);
}

/** https://html.spec.whatwg.org/#dom-domstringmap-removeitem */
function deleteNamed(el: NodeImpl, name: string): void {
  const a = findAttributeByNamespace(el, null, toAttributeName(name));
  if (a !== null) removeAttributeRecord(el, a);
}

export class DOMStringMap {
  [name: string]: string | undefined;

  /** @internal */
  constructor(el: NodeImpl) {
    const target = Object.create(DOMStringMap.prototype) as DOMStringMap;
    return new Proxy(target, {
      get(t, key, receiver) {
        if (typeof key === "string") {
          const v = getNamed(el, key);
          if (v !== undefined) return v;
        }
        return Reflect.get(t, key, receiver);
      },
      set(t, key, value, receiver) {
        if (typeof key === "string") {
          setNamed(el, key, String(value));
          return true;
        }
        return Reflect.set(t, key, value, receiver);
      },
      has(t, key) {
        if (typeof key === "string" && getNamed(el, key) !== undefined) return true;
        return Reflect.has(t, key);
      },
      deleteProperty(t, key) {
        if (typeof key === "string") {
          deleteNamed(el, key);
          return true;
        }
        return Reflect.deleteProperty(t, key);
      },
      ownKeys(t) {
        const keys: (string | symbol)[] = supportedNames(el);
        for (const k of Reflect.ownKeys(t)) if (!keys.includes(k)) keys.push(k);
        return keys;
      },
      getOwnPropertyDescriptor(t, key) {
        if (typeof key === "string") {
          const v = getNamed(el, key);
          if (v !== undefined) return { value: v, writable: true, enumerable: true, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(t, key);
      },
      defineProperty(t, key, descriptor) {
        if (typeof key === "string") {
          if (descriptor.get !== undefined || descriptor.set !== undefined) return false;
          setNamed(el, key, String(descriptor.value));
          return true;
        }
        return Reflect.defineProperty(t, key, descriptor);
      },
    });
  }
}

Object.defineProperty(DOMStringMap.prototype, Symbol.toStringTag, { value: "DOMStringMap", configurable: true });
