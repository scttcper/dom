// Name validation shared by the node factories.
// https://dom.spec.whatwg.org/#namespaces (valid element local name, valid attribute local
// name, valid namespace prefix, valid doctype name, validate and extract)

import { XMLNS_NS, XML_NS } from "./constants.ts";
import { isValidAttributeLocalName } from "./attributes.ts";

/** https://dom.spec.whatwg.org/#valid-element-local-name (fast path for ASCII). */
export function isValidElementLocalName(name: string): boolean {
  const len = name.length;
  if (len === 0) return false;
  const c0 = name.charCodeAt(0);
  if ((c0 >= 97 && c0 <= 122) || (c0 >= 65 && c0 <= 90)) {
    for (let i = 1; i < len; i++) {
      const c = name.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d || c === 0x00 || c === 0x2f || c === 0x3e)
        return false;
    }
    return true;
  }
  if (c0 !== 0x3a && c0 !== 0x5f && c0 < 0x80) return false;
  for (let i = 1; i < len; i++) {
    const c = name.charCodeAt(i);
    const ok =
      (c >= 97 && c <= 122) ||
      (c >= 65 && c <= 90) ||
      (c >= 48 && c <= 57) ||
      c === 0x2d ||
      c === 0x2e ||
      c === 0x3a ||
      c === 0x5f ||
      c >= 0x80;
    if (!ok) return false;
  }
  return true;
}

/** https://dom.spec.whatwg.org/#valid-namespace-prefix */
export function isValidNamespacePrefix(name: string): boolean {
  const len = name.length;
  if (len === 0) return false;
  for (let i = 0; i < len; i++) {
    const c = name.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d || c === 0x00 || c === 0x2f || c === 0x3e)
      return false;
  }
  return true;
}

/** https://dom.spec.whatwg.org/#valid-doctype-name */
export function isValidDoctypeName(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d || c === 0x00 || c === 0x3e) return false;
  }
  return true;
}

// https://www.w3.org/TR/xml/#NT-NameStartChar / #NT-NameChar
const NAME_START =
  "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const XML_NAME = new RegExp(`^[:${NAME_START}][:${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`, "u");

/** https://www.w3.org/TR/xml/#NT-Name (ProcessingInstruction targets). */
export function isXMLName(name: string): boolean {
  return XML_NAME.test(name);
}

export interface Extracted {
  namespace: string | null;
  prefix: string | null;
  localName: string;
}

/** https://dom.spec.whatwg.org/#validate-and-extract */
export function validateAndExtract(
  namespace: string | null,
  qualifiedName: string,
  context: "element" | "attribute",
): Extracted {
  // Step 1.
  if (namespace === "") namespace = null;
  // Steps 2-4.
  let prefix: string | null = null;
  let localName = qualifiedName;
  const colon = qualifiedName.indexOf(":");
  if (colon !== -1) {
    prefix = qualifiedName.slice(0, colon);
    localName = qualifiedName.slice(colon + 1);
    if (!isValidNamespacePrefix(prefix))
      throw new DOMException(`"${prefix}" is not a valid namespace prefix.`, "InvalidCharacterError");
  }
  // Steps 6-7.
  if (context === "attribute" ? !isValidAttributeLocalName(localName) : !isValidElementLocalName(localName)) {
    throw new DOMException(`"${qualifiedName}" is not a valid qualified name.`, "InvalidCharacterError");
  }
  // Steps 8-11.
  if (prefix !== null && namespace === null)
    throw new DOMException("A prefix was given but no namespace was provided.", "NamespaceError");
  if (prefix === "xml" && namespace !== XML_NS) {
    throw new DOMException(
      'A prefix of "xml" was given but the namespace was not the XML namespace.',
      "NamespaceError",
    );
  }
  if ((qualifiedName === "xmlns" || prefix === "xmlns") && namespace !== XMLNS_NS) {
    throw new DOMException(
      'A prefix or qualifiedName of "xmlns" was given but the namespace was not the XMLNS namespace.',
      "NamespaceError",
    );
  }
  if (namespace === XMLNS_NS && qualifiedName !== "xmlns" && prefix !== "xmlns") {
    throw new DOMException(
      'The XMLNS namespace was given but neither the prefix nor qualifiedName was "xmlns".',
      "NamespaceError",
    );
  }
  return { namespace, prefix, localName };
}
