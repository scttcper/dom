// The CSS namespace.
// https://drafts.csswg.org/cssom/#namespacedef-css
// https://drafts.csswg.org/css-conditional-3/#the-css-namespace
// https://drafts.css-houdini.org/css-properties-values-api/#the-registerproperty-function

import { evaluateSupportsCondition, supportsDeclaration } from "./supports.ts";

/** https://drafts.csswg.org/cssom/#serialize-an-identifier */
export function escape(ident: string): string {
  if (arguments.length === 0) throw new TypeError("Failed to execute 'escape' on 'CSS': 1 argument required, but only 0 present.");
  const s = String(ident);
  const len = s.length;
  const first = s.charCodeAt(0);
  let out = "";
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) out += "�";
    else if ((c >= 0x01 && c <= 0x1f) || c === 0x7f) out += "\\" + c.toString(16) + " ";
    else if (i === 0 && c >= 0x30 && c <= 0x39) out += "\\" + c.toString(16) + " ";
    else if (i === 1 && c >= 0x30 && c <= 0x39 && first === 0x2d) out += "\\" + c.toString(16) + " ";
    else if (i === 0 && c === 0x2d && len === 1) out += "\\-";
    else if (c >= 0x80 || c === 0x2d || c === 0x5f || (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) out += s[i];
    else out += "\\" + s[i];
  }
  return out;
}

/** https://drafts.csswg.org/css-conditional-3/#dom-css-supports */
export function supports(conditionOrProperty: string, value?: string): boolean {
  if (arguments.length === 0) throw new TypeError("Failed to execute 'supports' on 'CSS': 1 argument required, but only 0 present.");
  if (arguments.length >= 2) return supportsDeclaration(String(conditionOrProperty), String(value));
  return evaluateSupportsCondition(String(conditionOrProperty));
}

const registered = new Set<string>();

/** https://drafts.css-houdini.org/css-properties-values-api/#dom-css-registerproperty — records the name only. */
export function registerProperty(definition: { name: string; syntax?: string; inherits?: boolean; initialValue?: string }): void {
  if (definition === null || typeof definition !== "object" || typeof definition.name !== "string") {
    throw new TypeError("Failed to execute 'registerProperty' on 'CSS': required member name is undefined.");
  }
  if (!definition.name.startsWith("--")) {
    throw new DOMException(`Failed to execute 'registerProperty' on 'CSS': Custom property names must start with '--'.`, "SyntaxError");
  }
  if (registered.has(definition.name)) {
    throw new DOMException(`Failed to execute 'registerProperty' on 'CSS': The name provided has already been registered.`, "InvalidModificationError");
  }
  registered.add(definition.name);
}

/**
 * The `CSS` namespace object (https://webidl.spec.whatwg.org/#es-namespaces): an ordinary,
 * extensible object whose operations are writable/enumerable/configurable data properties, so
 * tests can stub them (`CSS.supports = vi.fn()`).
 */
export const CSS: { escape: typeof escape; supports: typeof supports; registerProperty: typeof registerProperty } = {
  escape,
  supports,
  registerProperty,
};
Object.defineProperty(CSS, Symbol.toStringTag, { value: "CSS", writable: false, enumerable: false, configurable: true });
