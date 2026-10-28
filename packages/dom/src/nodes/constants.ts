// Node type constants — https://dom.spec.whatwg.org/#dom-node-nodetype
export const ELEMENT_NODE = 1;
export const ATTRIBUTE_NODE = 2;
export const TEXT_NODE = 3;
export const CDATA_SECTION_NODE = 4;
export const ENTITY_REFERENCE_NODE = 5;
export const ENTITY_NODE = 6;
export const PROCESSING_INSTRUCTION_NODE = 7;
export const COMMENT_NODE = 8;
export const DOCUMENT_NODE = 9;
export const DOCUMENT_TYPE_NODE = 10;
export const DOCUMENT_FRAGMENT_NODE = 11;
export const NOTATION_NODE = 12;

// compareDocumentPosition bits — https://dom.spec.whatwg.org/#dom-node-comparedocumentposition
export const DOCUMENT_POSITION_DISCONNECTED = 0x01;
export const DOCUMENT_POSITION_PRECEDING = 0x02;
export const DOCUMENT_POSITION_FOLLOWING = 0x04;
export const DOCUMENT_POSITION_CONTAINS = 0x08;
export const DOCUMENT_POSITION_CONTAINED_BY = 0x10;
export const DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = 0x20;

// Namespaces — https://infra.spec.whatwg.org/#namespaces
export const HTML_NS = "http://www.w3.org/1999/xhtml";
export const SVG_NS = "http://www.w3.org/2000/svg";
export const MATHML_NS = "http://www.w3.org/1998/Math/MathML";
export const XLINK_NS = "http://www.w3.org/1999/xlink";
export const XML_NS = "http://www.w3.org/XML/1998/namespace";
export const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

// NodeImpl.flags bits. Subsystems may claim new bits here (keep this the single registry).
/** Node is connected (its shadow-including root is a document). Maintained by insert/remove. */
export const F_CONNECTED = 1 << 0;
/** Element is in the HTML namespace and its node document is an HTML document: qualified names match ASCII case-insensitively. */
export const F_HTML = 1 << 1;
/** Wrapper overrides `_connectedSteps` / `_disconnectedSteps`; only these elements get the virtual call during subtree walks. */
export const F_CONNECT_HOOK = 1 << 2;
/** Wrapper overrides `_attributeChangedSteps`; only these elements get the virtual call on attribute changes. */
export const F_ATTR_HOOK = 1 << 3;
/** Wrapper overrides `_childrenChangedSteps` (e.g. <style>, <option>, <title>, <textarea> default value). */
export const F_CHILDREN_HOOK = 1 << 4;
/** Node is a shadow root. */
export const F_SHADOW_ROOT = 1 << 5;
/** Element has a non-empty `style` attribute (cheap visibility/computed-style fast path). */
export const F_HAS_STYLE_ATTR = 1 << 6;
/** Element is a custom element candidate (valid custom element name). */
export const F_CUSTOM = 1 << 7;
/** The node's live `childNodes` NodeList has been materialized; tree.ts keeps it in sync (collections/NodeList.ts). */
export const F_CHILD_LIST = 1 << 8;
/** Element has a shadow root (`Element._shadowRoot !== null`); lets hot walks skip the wrapper load. */
export const F_HAS_SHADOW = 1 << 9;
/** Custom element state is "custom" (https://dom.spec.whatwg.org/#concept-element-custom-element-state); owned by src/html/custom-elements.ts. */
export const F_CE_CUSTOM = 1 << 10;
/** Node has a registered observer list (observers/queue.ts); lets record queueing skip unobserved ancestors. */
export const F_MO_REGISTERED = 1 << 11;
/** Wrapper overrides `_adoptingSteps(oldDocument)` (https://dom.spec.whatwg.org/#concept-node-adopt-ext), e.g. <template>, custom elements. */
export const F_ADOPT_HOOK = 1 << 12;
/** Element is a form-associated custom element (its definition has `static formAssociated = true`); set by html/custom-elements.ts, read by html/forms. */
export const F_FACE = 1 << 14;
/**
 * Element has an attribute whose local name starts with `aria-` (any namespace, so it may be set
 * when no null-namespace one exists): lookups of `aria-*` names skip elements without it. Kept
 * by nodes/attributes.ts (addRecord, removeAttributeRecord) and nodes/clone.ts.
 */
export const F_ARIA_ATTRS = 1 << 15;
/** Same for `data-*` attributes (Testing Library's *ByTestId). */
export const F_DATA_ATTRS = 1 << 16;
/**
 * Element has a `tabindex` / `contenteditable` / `inert` attribute (any namespace), kept like
 * F_ARIA_ATTRS. Focus code reads `tabIndex` on every candidate of a tabbable scan, and most
 * elements have none of these: in Base UI's interaction tests the attribute scans behind them
 * were ~140 ms.
 */
export const F_TABINDEX_ATTR = 1 << 13;
export const F_CONTENTEDITABLE_ATTR = 1 << 17;
export const F_INERT_ATTR = 1 << 18;
