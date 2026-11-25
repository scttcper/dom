// The CSS namespace.
// https://drafts.csswg.org/cssom/#namespacedef-css
// https://drafts.csswg.org/css-conditional-3/#the-css-namespace
// https://drafts.css-houdini.org/css-properties-values-api/#the-registerproperty-function

import { evaluateSupportsCondition, supportsDeclaration } from "./supports.ts";
import { argumentsRequired } from "../webidl-runtime.ts";
import { serializeIdentifier } from "../selectors/serialize.ts";

/** https://drafts.csswg.org/cssom/#serialize-an-identifier */
export function escape(ident: string): string {
  if (arguments.length === 0) argumentsRequired("escape", "CSS", 1, 0);
  return serializeIdentifier(String(ident));
}

/** https://drafts.csswg.org/css-conditional-3/#dom-css-supports */
export function supports(conditionOrProperty: string, value?: string): boolean {
  if (arguments.length === 0) argumentsRequired("supports", "CSS", 1, 0);
  if (arguments.length >= 2) return supportsDeclaration(String(conditionOrProperty), String(value));
  return evaluateSupportsCondition(String(conditionOrProperty));
}

const registered = new Set<string>();

/** https://drafts.css-houdini.org/css-properties-values-api/#dom-css-registerproperty — records the name only. */
export function registerProperty(definition: {
  name: string;
  syntax?: string;
  inherits?: boolean;
  initialValue?: string;
}): void {
  if (definition === null || typeof definition !== "object" || typeof definition.name !== "string") {
    throw new TypeError("Failed to execute 'registerProperty' on 'CSS': required member name is undefined.");
  }
  if (!definition.name.startsWith("--")) {
    throw new DOMException(
      `Failed to execute 'registerProperty' on 'CSS': Custom property names must start with '--'.`,
      "SyntaxError",
    );
  }
  if (registered.has(definition.name)) {
    throw new DOMException(
      `Failed to execute 'registerProperty' on 'CSS': The name provided has already been registered.`,
      "InvalidModificationError",
    );
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
Object.defineProperty(CSS, Symbol.toStringTag, {
  value: "CSS",
  writable: false,
  enumerable: false,
  configurable: true,
});
