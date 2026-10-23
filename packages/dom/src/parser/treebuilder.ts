// @scriptc-compatible
// HTML tree construction.
// https://html.spec.whatwg.org/#tree-construction
//
// The tree builder talks to the DOM only through `TreeSink`, using integer node handles that
// the sink allocates sequentially from 0. It keeps the per-element facts it needs (namespace,
// parser tag id, local name, integration-point flag) in its own arrays indexed by handle, so
// the hot checks (scopes, special category, implied end tags) are small-integer table lookups
// and never touch DOM objects.
//
// Implemented: every insertion mode of the current standard (including the 2025 relaxed
// <select> parsing, which removed the "in select" modes; that is what browsers ship), the
// stack of open elements, the list of active formatting elements with the Noah's Ark clause,
// the adoption agency algorithm, foster parenting, foreign content (SVG/MathML) with name
// adjustments and integration points, template contents, declarative shadow roots, the
// fragment case, quirks-mode detection, and (opt-in) processing instructions.
// Not implemented (no use without script execution / sanitizer): the parser sanitizer
// configuration and insertion target redirection for sanitizing, template `for` patching,
// speculative parsing, script execution and document.write.

import {
  S_DATA,
  S_PLAINTEXT,
  S_RAWTEXT,
  S_RCDATA,
  S_SCRIPT_DATA,
  TK_CHARS,
  TK_COMMENT,
  TK_DOCTYPE,
  TK_END,
  TK_EOF,
  TK_PI,
  TK_START,
  Tokenizer,
} from "./tokenizer.ts";
import * as T from "./tags.ts";

// --- namespaces and attribute namespaces -----------------------------------------------------
export const NS_HTML = 0;
export const NS_SVG = 1;
export const NS_MATHML = 2;
/** The fragment context element's namespace when it is none of the above (sink-defined). */
export const NS_OTHER = 3;
export const ANS_NONE = 0;
export const ANS_XLINK = 1;
export const ANS_XML = 2;
export const ANS_XMLNS = 3;

// --- document modes --------------------------------------------------------------------------
export const MODE_NO_QUIRKS = 0;
export const MODE_QUIRKS = 1;
export const MODE_LIMITED_QUIRKS = 2;

// --- insertion modes (https://html.spec.whatwg.org/#the-insertion-mode) -------------------------
const M_INITIAL = 0;
const M_BEFORE_HTML = 1;
const M_BEFORE_HEAD = 2;
const M_IN_HEAD = 3;
const M_IN_HEAD_NOSCRIPT = 4;
const M_AFTER_HEAD = 5;
const M_IN_BODY = 6;
const M_TEXT = 7;
const M_IN_TABLE = 8;
const M_IN_TABLE_TEXT = 9;
const M_IN_CAPTION = 10;
const M_IN_COLUMN_GROUP = 11;
const M_IN_TABLE_BODY = 12;
const M_IN_ROW = 13;
const M_IN_CELL = 14;
const M_IN_TEMPLATE = 15;
const M_AFTER_BODY = 16;
const M_IN_FRAMESET = 17;
const M_AFTER_FRAMESET = 18;
const M_AFTER_AFTER_BODY = 19;
const M_AFTER_AFTER_FRAMESET = 20;

// --- per-tag-id property bits ------------------------------------------------------------------
const B_SCOPE = 1; // https://html.spec.whatwg.org/#has-an-element-in-scope
const B_LIST_SCOPE = 2; // + ol, ul
const B_BUTTON_SCOPE = 4; // + button
const B_TABLE_SCOPE = 8; // html, table, template
const B_SPECIAL = 16; // https://html.spec.whatwg.org/#special
const B_IMPLIED = 32; // https://html.spec.whatwg.org/#generate-implied-end-tags
const B_THOROUGH = 64; // https://html.spec.whatwg.org/#generate-all-implied-end-tags-thoroughly
const B_FORMATTING = 128; // https://html.spec.whatwg.org/#formatting
const B_FOREIGN_BREAKOUT = 256; // start tags that break out of foreign content
const B_FORM_ASSOCIATED = 512; // https://html.spec.whatwg.org/#form-associated-element
const B_LISTED = 1024; // https://html.spec.whatwg.org/#category-listed

const props = new Int32Array(T.ID_LIMIT);
function mark(bits: number, ids: number[]): void {
  for (let i = 0; i < ids.length; i++) props[ids[i]] |= bits;
}
mark(B_SCOPE, [
  T.T_APPLET, T.T_CAPTION, T.T_HTML, T.T_TABLE, T.T_TD, T.T_TH, T.T_MARQUEE, T.T_OBJECT, T.T_SELECT, T.T_TEMPLATE,
  T.F_MI, T.F_MO, T.F_MN, T.F_MS, T.F_MTEXT, T.F_ANNOTATION_XML, T.F_FOREIGNOBJECT, T.F_DESC, T.F_SVG_TITLE,
]);
mark(B_LIST_SCOPE, [T.T_OL, T.T_UL]);
mark(B_BUTTON_SCOPE, [T.T_BUTTON]);
mark(B_TABLE_SCOPE, [T.T_HTML, T.T_TABLE, T.T_TEMPLATE]);
mark(B_SPECIAL, [
  T.T_ADDRESS, T.T_APPLET, T.T_AREA, T.T_ARTICLE, T.T_ASIDE, T.T_BASE, T.T_BASEFONT, T.T_BGSOUND, T.T_BLOCKQUOTE,
  T.T_BODY, T.T_BR, T.T_BUTTON, T.T_CAPTION, T.T_CENTER, T.T_COL, T.T_COLGROUP, T.T_DD, T.T_DETAILS, T.T_DIR, T.T_DIV,
  T.T_DL, T.T_DT, T.T_EMBED, T.T_FIELDSET, T.T_FIGCAPTION, T.T_FIGURE, T.T_FOOTER, T.T_FORM, T.T_FRAME, T.T_FRAMESET,
  T.T_H1, T.T_H2, T.T_H3, T.T_H4, T.T_H5, T.T_H6, T.T_HEAD, T.T_HEADER, T.T_HGROUP, T.T_HR, T.T_HTML, T.T_IFRAME,
  T.T_IMG, T.T_INPUT, T.T_KEYGEN, T.T_LI, T.T_LINK, T.T_LISTING, T.T_MAIN, T.T_MARQUEE, T.T_MENU, T.T_META, T.T_NAV,
  T.T_NOEMBED, T.T_NOFRAMES, T.T_NOSCRIPT, T.T_OBJECT, T.T_OL, T.T_P, T.T_PARAM, T.T_PLAINTEXT, T.T_PRE, T.T_SCRIPT,
  T.T_SEARCH, T.T_SECTION, T.T_SELECT, T.T_SOURCE, T.T_STYLE, T.T_SUMMARY, T.T_TABLE, T.T_TBODY, T.T_TD,
  T.T_TEMPLATE, T.T_TEXTAREA, T.T_TFOOT, T.T_TH, T.T_THEAD, T.T_TITLE, T.T_TR, T.T_TRACK, T.T_UL, T.T_WBR, T.T_XMP,
  T.F_MI, T.F_MO, T.F_MN, T.F_MS, T.F_MTEXT, T.F_ANNOTATION_XML, T.F_FOREIGNOBJECT, T.F_DESC, T.F_SVG_TITLE,
]);
mark(B_IMPLIED, [T.T_DD, T.T_DT, T.T_LI, T.T_OPTGROUP, T.T_OPTION, T.T_P, T.T_RB, T.T_RP, T.T_RT, T.T_RTC]);
mark(B_THOROUGH, [
  T.T_CAPTION, T.T_COLGROUP, T.T_DD, T.T_DT, T.T_LI, T.T_OPTGROUP, T.T_OPTION, T.T_P, T.T_RB, T.T_RP, T.T_RT,
  T.T_RTC, T.T_TBODY, T.T_TD, T.T_TFOOT, T.T_TH, T.T_THEAD, T.T_TR,
]);
mark(B_FORMATTING, [
  T.T_A, T.T_B, T.T_BIG, T.T_CODE, T.T_EM, T.T_FONT, T.T_I, T.T_NOBR, T.T_S, T.T_SMALL, T.T_STRIKE, T.T_STRONG, T.T_TT,
  T.T_U,
]);
mark(B_FOREIGN_BREAKOUT, [
  T.T_B, T.T_BIG, T.T_BLOCKQUOTE, T.T_BODY, T.T_BR, T.T_CENTER, T.T_CODE, T.T_DD, T.T_DIV, T.T_DL, T.T_DT, T.T_EM,
  T.T_EMBED, T.T_H1, T.T_H2, T.T_H3, T.T_H4, T.T_H5, T.T_H6, T.T_HEAD, T.T_HR, T.T_I, T.T_IMG, T.T_LI, T.T_LISTING,
  T.T_MENU, T.T_META, T.T_NOBR, T.T_OL, T.T_P, T.T_PRE, T.T_RUBY, T.T_S, T.T_SMALL, T.T_SPAN, T.T_STRONG, T.T_STRIKE,
  T.T_SUB, T.T_SUP, T.T_TABLE, T.T_TT, T.T_U, T.T_UL, T.T_VAR,
]);
mark(B_FORM_ASSOCIATED, [
  T.T_BUTTON, T.T_FIELDSET, T.T_INPUT, T.T_OBJECT, T.T_OUTPUT, T.T_SELECT, T.T_TEXTAREA, T.T_IMG,
]);
mark(B_LISTED, [T.T_BUTTON, T.T_FIELDSET, T.T_INPUT, T.T_OBJECT, T.T_OUTPUT, T.T_SELECT, T.T_TEXTAREA]);

/** Lowercase tag name → parser tag id (for context elements and fake tokens). */
const tagIds = new Map<string, number>();
for (let i = 1; i < T.TAG_NAMES.length; i++) tagIds.set(T.TAG_NAMES[i], i);

export function parserTagId(lowerName: string): number {
  const id = tagIds.get(lowerName);
  return id === undefined ? 0 : id;
}

// https://html.spec.whatwg.org/#adjust-svg-attributes
const SVG_ATTRS: string[] = [
  "attributeName", "attributeType", "baseFrequency", "baseProfile", "calcMode", "clipPathUnits", "diffuseConstant",
  "edgeMode", "filterUnits", "glyphRef", "gradientTransform", "gradientUnits", "kernelMatrix", "kernelUnitLength",
  "keyPoints", "keySplines", "keyTimes", "lengthAdjust", "limitingConeAngle", "markerHeight", "markerUnits",
  "markerWidth", "maskContentUnits", "maskUnits", "numOctaves", "pathLength", "patternContentUnits",
  "patternTransform", "patternUnits", "pointsAtX", "pointsAtY", "pointsAtZ", "preserveAlpha", "preserveAspectRatio",
  "primitiveUnits", "refX", "refY", "repeatCount", "repeatDur", "requiredExtensions", "requiredFeatures",
  "specularConstant", "specularExponent", "spreadMethod", "startOffset", "stdDeviation", "stitchTiles",
  "surfaceScale", "systemLanguage", "tableValues", "targetX", "targetY", "textLength", "viewBox", "viewTarget",
  "xChannelSelector", "yChannelSelector", "zoomAndPan",
];
// https://html.spec.whatwg.org/#parsing-main-inforeign (SVG tag name adjustments)
const SVG_TAGS: string[] = [
  "altGlyph", "altGlyphDef", "altGlyphItem", "animateColor", "animateMotion", "animateTransform", "clipPath",
  "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting",
  "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
  "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
  "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "foreignObject", "glyphRef", "linearGradient",
  "radialGradient", "textPath",
];
const svgAttrMap = new Map<string, string>();
for (let i = 0; i < SVG_ATTRS.length; i++) svgAttrMap.set(SVG_ATTRS[i].toLowerCase(), SVG_ATTRS[i]);
const svgTagMap = new Map<string, string>();
for (let i = 0; i < SVG_TAGS.length; i++) svgTagMap.set(SVG_TAGS[i].toLowerCase(), SVG_TAGS[i]);

// https://html.spec.whatwg.org/#the-initial-insertion-mode (quirks mode public identifiers)
const QUIRKS_PUBLIC_PREFIXES: string[] = [
  "+//silmaril//dtd html pro v0r11 19970101//", "-//as//dtd html 3.0 aswedit + extensions//",
  "-//advasoft ltd//dtd html 3.0 aswedit + extensions//", "-//ietf//dtd html 2.0 level 1//",
  "-//ietf//dtd html 2.0 level 2//", "-//ietf//dtd html 2.0 strict level 1//", "-//ietf//dtd html 2.0 strict level 2//",
  "-//ietf//dtd html 2.0 strict//", "-//ietf//dtd html 2.0//", "-//ietf//dtd html 2.1e//", "-//ietf//dtd html 3.0//",
  "-//ietf//dtd html 3.2 final//", "-//ietf//dtd html 3.2//", "-//ietf//dtd html 3//", "-//ietf//dtd html level 0//",
  "-//ietf//dtd html level 1//", "-//ietf//dtd html level 2//", "-//ietf//dtd html level 3//",
  "-//ietf//dtd html strict level 0//", "-//ietf//dtd html strict level 1//", "-//ietf//dtd html strict level 2//",
  "-//ietf//dtd html strict level 3//", "-//ietf//dtd html strict//", "-//ietf//dtd html//",
  "-//metrius//dtd metrius presentational//", "-//microsoft//dtd internet explorer 2.0 html strict//",
  "-//microsoft//dtd internet explorer 2.0 html//", "-//microsoft//dtd internet explorer 2.0 tables//",
  "-//microsoft//dtd internet explorer 3.0 html strict//", "-//microsoft//dtd internet explorer 3.0 html//",
  "-//microsoft//dtd internet explorer 3.0 tables//", "-//netscape comm. corp.//dtd html//",
  "-//netscape comm. corp.//dtd strict html//", "-//o'reilly and associates//dtd html 2.0//",
  "-//o'reilly and associates//dtd html extended 1.0//", "-//o'reilly and associates//dtd html extended relaxed 1.0//",
  "-//sq//dtd html 2.0 hotmetal + extensions//",
  "-//softquad software//dtd hotmetal pro 6.0::19990601::extensions to html 4.0//",
  "-//softquad//dtd hotmetal pro 4.0::19971010::extensions to html 4.0//", "-//spyglass//dtd html 2.0 extended//",
  "-//sun microsystems corp.//dtd hotjava html//", "-//sun microsystems corp.//dtd hotjava strict html//",
  "-//w3c//dtd html 3 1995-03-24//", "-//w3c//dtd html 3.2 draft//", "-//w3c//dtd html 3.2 final//",
  "-//w3c//dtd html 3.2//", "-//w3c//dtd html 3.2s draft//", "-//w3c//dtd html 4.0 frameset//",
  "-//w3c//dtd html 4.0 transitional//", "-//w3c//dtd html experimental 19960712//",
  "-//w3c//dtd html experimental 970421//", "-//w3c//dtd w3 html//", "-//w3o//dtd w3 html 3.0//",
  "-//webtechs//dtd mozilla html 2.0//", "-//webtechs//dtd mozilla html//",
];

function asciiLower(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      let out = s.slice(0, i);
      for (let j = i; j < s.length; j++) {
        const d = s.charCodeAt(j);
        out += d >= 65 && d <= 90 ? String.fromCharCode(d + 32) : s[j];
      }
      return out;
    }
  }
  return s;
}

function isWsCode(c: number): boolean {
  return c === 32 || c === 10 || c === 9 || c === 12 || c === 13;
}

function isAllWs(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (!isWsCode(s.charCodeAt(i))) return false;
  return true;
}

function hasNonWsNonNull(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!isWsCode(c) && c !== 0) return true;
  }
  return false;
}

function removeNulls(s: string): string {
  return s.indexOf("\0") < 0 ? s : s.replaceAll("\0", "");
}

/**
 * The DOM side of the parser. Every method has a do-nothing default so subclasses override
 * only what they need (and so the class is concrete for scriptc). Handles are allocated by the
 * sink, sequentially from 0 per parse; `parent === -1` in an insertion location means "the
 * parent of `ref`" (foster parenting before a table whose parent the builder does not track).
 */
export class TreeSink {
  /**
   * Create an element in the node document of `parent` (or of `ref`'s parent when parent is
   * -1). `attrNs` holds ANS_* codes when `hasNs` (foreign elements), in which case `names`
   * are local names.
   */
  createElement(
    name: string,
    ns: number,
    parent: number,
    ref: number,
    names: string[],
    values: string[],
    attrNs: number[],
    count: number,
    hasNs: boolean,
  ): number {
    return -1;
  }
  /** Insert (or move) `child` into `parent` before `ref` (-1 = append). */
  insert(parent: number, ref: number, child: number): void {}
  /** Insert text before `ref` (or append), merging with an adjacent previous Text node. */
  insertText(parent: number, ref: number, text: string): void {}
  insertComment(parent: number, ref: number, data: string): void {}
  insertProcessingInstruction(parent: number, ref: number, target: string, data: string): void {}
  /** Append a doctype to the document handle. */
  insertDoctype(doc: number, name: string, publicId: string, systemId: string): void {}
  /** Detach `child` from its parent, if any. */
  remove(child: number): void {}
  hasParent(node: number): boolean {
    return false;
  }
  /** Move all children of `from` to the end of `to`. */
  reparentChildren(from: number, to: number): void {}
  /** Add the given attributes to `node` where it does not already have them. */
  addMissingAttributes(node: number, names: string[], values: string[], count: number): void {}
  /** Handle of a template element's contents fragment (allocates a handle). */
  templateContents(template: number): number {
    return template;
  }
  /**
   * Attach a declarative shadow root to `host`; returns the shadow root's handle or -1 if
   * that is not possible (the template is then inserted as a normal template element).
   */
  attachDeclarativeShadowRoot(
    host: number,
    mode: string,
    delegatesFocus: boolean,
    serializable: boolean,
    slotAssignment: string,
    clonable: boolean,
  ): number {
    return -1;
  }
  /** https://html.spec.whatwg.org/#create-an-element-for-the-token form owner association. */
  associateForm(element: number, form: number): void {}
  setDocumentMode(mode: number): void {}
}

/** Per-parse options. */
export class ParseOptions {
  scripting: boolean;
  allowDeclarativeShadowRoots: boolean;
  processingInstructions: boolean;
  /** iframe srcdoc documents are never put in quirks mode. */
  iframeSrcdoc: boolean;
  constructor() {
    this.scripting = false;
    this.allowDeclarativeShadowRoots = false;
    this.processingInstructions = false;
    this.iframeSrcdoc = false;
  }
}

export class TreeBuilder {
  sink: TreeSink;
  tok: Tokenizer;

  // per-handle element facts
  hNs: number[];
  hTag: number[];
  hName: string[];
  hIP: boolean[];
  hContents: number[];

  stack: number[];
  afe: number[];
  afeTok: number[];
  // token pool for active formatting elements
  ptName: string[];
  ptId: number[];
  ptAttrStart: number[];
  ptAttrCount: number[];
  poolNames: string[];
  poolValues: string[];

  templateModes: number[];
  mode: number;
  originalMode: number;
  docHandle: number;
  headElement: number;
  formElement: number;
  fragmentContext: number;
  framesetOk: boolean;
  fosterParenting: boolean;
  documentMode: number;
  scripting: boolean;
  allowDSD: boolean;
  iframeSrcdoc: boolean;
  stopped: boolean;
  skipNewline: boolean;
  reprocess: boolean;

  /** Current token type (may be rewritten, e.g. </br> → <br>). */
  ttype: number;
  chars: string;
  cpos: number;
  charsHasNull: boolean;
  pendingTableText: string;
  pendingTableNonWs: boolean;

  // insertion location scratch
  locParent: number;
  locRef: number;
  // foreign attribute scratch
  fNames: string[];
  fValues: string[];
  fNs: number[];
  emptyStrings: string[];
  emptyNumbers: number[];

  constructor(sink: TreeSink) {
    this.sink = sink;
    this.tok = new Tokenizer();
    this.hNs = [];
    this.hTag = [];
    this.hName = [];
    this.hIP = [];
    this.hContents = [];
    this.stack = [];
    this.afe = [];
    this.afeTok = [];
    this.ptName = [];
    this.ptId = [];
    this.ptAttrStart = [];
    this.ptAttrCount = [];
    this.poolNames = [];
    this.poolValues = [];
    this.templateModes = [];
    this.mode = M_INITIAL;
    this.originalMode = M_INITIAL;
    this.docHandle = -1;
    this.headElement = -1;
    this.formElement = -1;
    this.fragmentContext = -1;
    this.framesetOk = true;
    this.fosterParenting = false;
    this.documentMode = MODE_NO_QUIRKS;
    this.scripting = false;
    this.allowDSD = false;
    this.iframeSrcdoc = false;
    this.stopped = false;
    this.skipNewline = false;
    this.reprocess = false;
    this.ttype = 0;
    this.chars = "";
    this.cpos = 0;
    this.charsHasNull = false;
    this.pendingTableText = "";
    this.pendingTableNonWs = false;
    this.locParent = -1;
    this.locRef = -1;
    this.fNames = [];
    this.fValues = [];
    this.fNs = [];
    this.emptyStrings = [];
    this.emptyNumbers = [];
  }

  private resetState(options: ParseOptions): void {
    this.hNs.length = 0;
    this.hTag.length = 0;
    this.hName.length = 0;
    this.hIP.length = 0;
    this.hContents.length = 0;
    this.stack.length = 0;
    this.afe.length = 0;
    this.afeTok.length = 0;
    this.ptName.length = 0;
    this.ptId.length = 0;
    this.ptAttrStart.length = 0;
    this.ptAttrCount.length = 0;
    this.poolNames.length = 0;
    this.poolValues.length = 0;
    this.templateModes.length = 0;
    this.mode = M_INITIAL;
    this.originalMode = M_INITIAL;
    this.docHandle = -1;
    this.headElement = -1;
    this.formElement = -1;
    this.fragmentContext = -1;
    this.framesetOk = true;
    this.fosterParenting = false;
    this.documentMode = MODE_NO_QUIRKS;
    this.scripting = options.scripting;
    this.allowDSD = options.allowDeclarativeShadowRoots;
    this.iframeSrcdoc = options.iframeSrcdoc;
    this.stopped = false;
    this.skipNewline = false;
    this.pendingTableText = "";
    this.pendingTableNonWs = false;
    this.tok.processingInstructions = options.processingInstructions;
  }

  /** Record facts for a handle the sink created outside the builder (document, fragment, context). */
  setMeta(h: number, ns: number, tag: number, name: string, ip: boolean): void {
    while (this.hNs.length <= h) {
      this.hNs.push(NS_HTML);
      this.hTag.push(0);
      this.hName.push("");
      this.hIP.push(false);
      this.hContents.push(-1);
    }
    this.hNs[h] = ns;
    this.hTag[h] = tag;
    this.hName[h] = name;
    this.hIP[h] = ip;
    this.hContents[h] = -1;
  }

  /** https://html.spec.whatwg.org/#parsing — parse a whole document into handle `doc`. */
  parseDocument(input: string, doc: number, options: ParseOptions): void {
    this.resetState(options);
    this.docHandle = doc;
    this.setMeta(doc, NS_HTML, 0, "#document", false);
    this.tok.reset(input);
    this.run();
  }

  /**
   * https://html.spec.whatwg.org/#html-fragment-parsing-algorithm
   * `root` stands in for the spec's root html element (it is the DocumentFragment that
   * receives the result, cf. the insertion target redirection map); `context` is the context
   * element (its facts given here); `form` the nearest form ancestor-or-self or -1.
   */
  parseFragment(
    input: string,
    root: number,
    context: number,
    contextName: string,
    contextNs: number,
    contextEncoding: string,
    form: number,
    documentMode: number,
    options: ParseOptions,
  ): void {
    this.resetState(options);
    this.documentMode = documentMode;
    this.setMeta(root, NS_HTML, T.T_HTML, "html", false);
    this.setContextMeta(context, contextName, contextNs, contextEncoding);
    this.fragmentContext = context;
    this.tok.reset(input);
    // Tokenizer state from the context element.
    if (contextNs === NS_HTML) {
      const t = this.hTag[context];
      if (t === T.T_TITLE || t === T.T_TEXTAREA) this.tok.state = S_RCDATA;
      else if (t === T.T_STYLE || t === T.T_XMP || t === T.T_IFRAME || t === T.T_NOEMBED || t === T.T_NOFRAMES) {
        this.tok.state = S_RAWTEXT;
      } else if (t === T.T_SCRIPT) this.tok.state = S_SCRIPT_DATA;
      else if (t === T.T_NOSCRIPT) {
        if (this.scripting) this.tok.state = S_RAWTEXT;
      } else if (t === T.T_PLAINTEXT) this.tok.state = S_PLAINTEXT;
      // No start tag has been emitted, so no end tag is "appropriate" (fragment case).
    }
    this.stack.push(root);
    if (contextNs === NS_HTML && this.hTag[context] === T.T_TEMPLATE) this.templateModes.push(M_IN_TEMPLATE);
    this.resetInsertionMode();
    this.formElement = form;
    this.tok.allowCDATA = this.hNs[this.adjustedCurrentNode()] !== NS_HTML;
    this.run();
  }

  private setContextMeta(h: number, name: string, ns: number, encoding: string): void {
    if (ns === NS_HTML) {
      this.setMeta(h, ns, parserTagId(name), name, false);
    } else {
      this.setMeta(h, ns, 0, name, false);
      this.setForeignFacts(h, ns, name, encoding);
    }
  }

  /** Foreign special ids and HTML integration points. */
  private setForeignFacts(h: number, ns: number, name: string, encoding: string): void {
    let tag = 0;
    let ip = false;
    if (ns === NS_MATHML) {
      if (name === "mi") tag = T.F_MI;
      else if (name === "mo") tag = T.F_MO;
      else if (name === "mn") tag = T.F_MN;
      else if (name === "ms") tag = T.F_MS;
      else if (name === "mtext") tag = T.F_MTEXT;
      else if (name === "annotation-xml") {
        tag = T.F_ANNOTATION_XML;
        const e = asciiLower(encoding);
        ip = e === "text/html" || e === "application/xhtml+xml";
      }
    } else if (ns === NS_SVG) {
      if (name === "foreignObject") tag = T.F_FOREIGNOBJECT;
      else if (name === "desc") tag = T.F_DESC;
      else if (name === "title") tag = T.F_SVG_TITLE;
      ip = tag !== 0;
    }
    this.hTag[h] = tag;
    this.hIP[h] = ip;
  }

  // --- main loop -------------------------------------------------------------------------

  private run(): void {
    const tok = this.tok;
    while (!this.stopped) {
      const type = tok.next();
      this.ttype = type;
      if (type === TK_CHARS) {
        this.chars = tok.text;
        this.cpos = 0;
        this.charsHasNull = tok.textHasNull;
        if (this.skipNewline) {
          this.skipNewline = false;
          if (this.chars.charCodeAt(0) === 10) {
            if (this.chars.length === 1) continue;
            this.cpos = 1;
          }
        }
      } else {
        this.skipNewline = false;
      }
      this.processToken();
      if (type === TK_EOF) break;
      // https://html.spec.whatwg.org/#markup-declaration-open-state — CDATA is allowed when the
      // adjusted current node is not an element in the HTML namespace.
      const stack = this.stack;
      tok.allowCDATA = stack.length !== 0 && this.hNs[this.adjustedCurrentNode()] !== NS_HTML;
    }
    // https://html.spec.whatwg.org/#stop-parsing: pop all the nodes off the stack.
    this.stack.length = 0;
    tok.release();
    this.chars = "";
    this.pendingTableText = "";
  }

  /** https://html.spec.whatwg.org/#tree-construction-dispatcher */
  private processToken(): void {
    do {
      this.reprocess = false;
      if (this.useHtmlRules()) this.dispatchMode(this.mode);
      else this.foreignContent();
    } while (this.reprocess && !this.stopped);
  }

  private useHtmlRules(): boolean {
    if (this.stack.length === 0) return true;
    const acn = this.adjustedCurrentNode();
    if (this.hNs[acn] === NS_HTML) return true;
    const type = this.ttype;
    if (type === TK_EOF) return true;
    const tag = this.hTag[acn];
    if (tag >= T.F_MI && tag <= T.F_MTEXT) {
      if (type === TK_CHARS) return true;
      if (type === TK_START && this.tok.tagId !== T.T_MGLYPH && this.tok.tagId !== T.T_MALIGNMARK) return true;
    }
    if (tag === T.F_ANNOTATION_XML && type === TK_START && this.tok.tagId === T.T_SVG) return true;
    if (this.hIP[acn] && (type === TK_START || type === TK_CHARS)) return true;
    return false;
  }

  private dispatchMode(mode: number): void {
    switch (mode) {
      case M_INITIAL:
        return this.initial();
      case M_BEFORE_HTML:
        return this.beforeHtml();
      case M_BEFORE_HEAD:
        return this.beforeHead();
      case M_IN_HEAD:
        return this.inHead();
      case M_IN_HEAD_NOSCRIPT:
        return this.inHeadNoscript();
      case M_AFTER_HEAD:
        return this.afterHead();
      case M_IN_BODY:
        return this.inBody();
      case M_TEXT:
        return this.text();
      case M_IN_TABLE:
        return this.inTable();
      case M_IN_TABLE_TEXT:
        return this.inTableText();
      case M_IN_CAPTION:
        return this.inCaption();
      case M_IN_COLUMN_GROUP:
        return this.inColumnGroup();
      case M_IN_TABLE_BODY:
        return this.inTableBody();
      case M_IN_ROW:
        return this.inRow();
      case M_IN_CELL:
        return this.inCell();
      case M_IN_TEMPLATE:
        return this.inTemplate();
      case M_AFTER_BODY:
        return this.afterBody();
      case M_IN_FRAMESET:
        return this.inFrameset();
      case M_AFTER_FRAMESET:
        return this.afterFrameset();
      case M_AFTER_AFTER_BODY:
        return this.afterAfterBody();
      case M_AFTER_AFTER_FRAMESET:
        return this.afterAfterFrameset();
    }
  }

  // --- stack helpers -----------------------------------------------------------------------

  private currentNode(): number {
    return this.stack[this.stack.length - 1];
  }

  /** https://html.spec.whatwg.org/#adjusted-current-node */
  private adjustedCurrentNode(): number {
    const stack = this.stack;
    if (this.fragmentContext >= 0 && stack.length === 1) return this.fragmentContext;
    return stack[stack.length - 1];
  }

  private isHtml(h: number, tag: number): boolean {
    return this.hTag[h] === tag && this.hNs[h] === NS_HTML;
  }

  /** Is `h` an HTML element with the current token's tag name? */
  private isHtmlNamedAsToken(h: number): boolean {
    if (this.hNs[h] !== NS_HTML) return false;
    const id = this.tok.tagId;
    return id !== 0 ? this.hTag[h] === id : this.hName[h] === this.tok.name;
  }

  private currentIs(tag: number): boolean {
    return this.isHtml(this.currentNode(), tag);
  }

  private pop(): void {
    this.stack.pop();
  }

  /** Pop until an HTML element with tag id `tag` has been popped. */
  private popUntil(tag: number): void {
    const stack = this.stack;
    while (stack.length !== 0) {
      const h = stack.pop() as number;
      if (this.hTag[h] === tag && this.hNs[h] === NS_HTML) return;
    }
  }

  private popUntilNode(node: number): void {
    const stack = this.stack;
    while (stack.length !== 0) {
      if ((stack.pop() as number) === node) return;
    }
  }

  private popUntilNamedAsToken(): void {
    const stack = this.stack;
    while (stack.length !== 0) {
      const h = stack.pop() as number;
      if (this.isHtmlNamedAsToken(h)) return;
    }
  }

  private stackIndexOf(node: number): number {
    const stack = this.stack;
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i] === node) return i;
    return -1;
  }

  /** https://html.spec.whatwg.org/#has-an-element-in-the-specific-scope (by HTML tag id). */
  private inScope(tag: number, extra: number): boolean {
    const stack = this.stack;
    for (let i = stack.length - 1; i >= 0; i--) {
      const h = stack[i];
      const t = this.hTag[h];
      if (t === tag && this.hNs[h] === NS_HTML) return true;
      const p = props[t];
      if (extra === B_TABLE_SCOPE) {
        if ((p & B_TABLE_SCOPE) !== 0 && this.hNs[h] === NS_HTML) return false;
      } else if ((p & (B_SCOPE | extra)) !== 0) {
        // B_LIST_SCOPE / B_BUTTON_SCOPE extras are HTML-namespace elements.
        if ((p & B_SCOPE) !== 0 || this.hNs[h] === NS_HTML) return false;
      }
    }
    return false;
  }

  /** Has an element in scope that is an HTML element named like the current token. */
  private tokenNameInScope(extra: number): boolean {
    const id = this.tok.tagId;
    if (id !== 0) return this.inScope(id, extra);
    const stack = this.stack;
    const name = this.tok.name;
    for (let i = stack.length - 1; i >= 0; i--) {
      const h = stack[i];
      if (this.hNs[h] === NS_HTML && this.hTag[h] === 0 && this.hName[h] === name) return true;
      const p = props[this.hTag[h]];
      if (extra === B_TABLE_SCOPE) {
        if ((p & B_TABLE_SCOPE) !== 0 && this.hNs[h] === NS_HTML) return false;
      } else if ((p & (B_SCOPE | extra)) !== 0) {
        if ((p & B_SCOPE) !== 0 || this.hNs[h] === NS_HTML) return false;
      }
    }
    return false;
  }

  /** https://html.spec.whatwg.org/#has-an-element-in-scope for a specific node. */
  private nodeInScope(node: number): boolean {
    const stack = this.stack;
    for (let i = stack.length - 1; i >= 0; i--) {
      const h = stack[i];
      if (h === node) return true;
      if ((props[this.hTag[h]] & B_SCOPE) !== 0) return false;
    }
    return false;
  }

  private isSpecial(h: number): boolean {
    return (props[this.hTag[h]] & B_SPECIAL) !== 0 && (this.hNs[h] === NS_HTML || this.hTag[h] >= T.F_MI);
  }

  private templateInStack(): boolean {
    const stack = this.stack;
    for (let i = stack.length - 1; i >= 0; i--) if (this.isHtml(stack[i], T.T_TEMPLATE)) return true;
    return false;
  }

  /** https://html.spec.whatwg.org/#parsing-template-contents */
  private parsingTemplateContents(): boolean {
    if (this.templateInStack()) return true;
    const ctx = this.fragmentContext;
    return ctx >= 0 && this.isHtml(ctx, T.T_TEMPLATE);
  }

  /** https://html.spec.whatwg.org/#generate-implied-end-tags */
  private generateImpliedEndTags(except: number): void {
    const stack = this.stack;
    for (;;) {
      const h = stack[stack.length - 1];
      const t = this.hTag[h];
      if (this.hNs[h] !== NS_HTML || (props[t] & B_IMPLIED) === 0 || t === except) return;
      stack.pop();
    }
  }

  private generateImpliedEndTagsThoroughly(): void {
    const stack = this.stack;
    for (;;) {
      const h = stack[stack.length - 1];
      if (this.hNs[h] !== NS_HTML || (props[this.hTag[h]] & B_THOROUGH) === 0) return;
      stack.pop();
    }
  }

  /** https://html.spec.whatwg.org/#close-a-p-element */
  private closePElement(): void {
    this.generateImpliedEndTags(T.T_P);
    this.popUntil(T.T_P);
  }

  private closePIfInButtonScope(): void {
    if (this.inScope(T.T_P, B_BUTTON_SCOPE)) this.closePElement();
  }

  /** https://html.spec.whatwg.org/#reset-the-insertion-mode-appropriately */
  private resetInsertionMode(): void {
    const stack = this.stack;
    for (let i = stack.length - 1; i >= 0; i--) {
      let node = stack[i];
      const last = i === 0;
      if (last && this.fragmentContext >= 0) node = this.fragmentContext;
      if (this.hNs[node] === NS_HTML) {
        switch (this.hTag[node]) {
          case T.T_TD:
          case T.T_TH:
            if (!last) {
              this.mode = M_IN_CELL;
              return;
            }
            break;
          case T.T_TR:
            this.mode = M_IN_ROW;
            return;
          case T.T_TBODY:
          case T.T_THEAD:
          case T.T_TFOOT:
            this.mode = M_IN_TABLE_BODY;
            return;
          case T.T_CAPTION:
            this.mode = M_IN_CAPTION;
            return;
          case T.T_COLGROUP:
            this.mode = M_IN_COLUMN_GROUP;
            return;
          case T.T_TABLE:
            this.mode = M_IN_TABLE;
            return;
          case T.T_TEMPLATE:
            this.mode = this.templateModes[this.templateModes.length - 1];
            return;
          case T.T_HEAD:
            if (!last) {
              this.mode = M_IN_HEAD;
              return;
            }
            break;
          case T.T_BODY:
            this.mode = M_IN_BODY;
            return;
          case T.T_FRAMESET:
            this.mode = M_IN_FRAMESET;
            return;
          case T.T_HTML:
            this.mode = this.headElement < 0 ? M_BEFORE_HEAD : M_AFTER_HEAD;
            return;
        }
      }
      if (last) {
        this.mode = M_IN_BODY;
        return;
      }
    }
    this.mode = M_IN_BODY;
  }

  // --- insertion ---------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#appropriate-place-for-inserting-a-node → locParent/locRef */
  private appropriatePlace(override: number): void {
    let target = override >= 0 ? override : this.currentNode();
    this.locRef = -1;
    if (this.fosterParenting && this.hNs[target] === NS_HTML) {
      const t = this.hTag[target];
      if (t === T.T_TABLE || t === T.T_TBODY || t === T.T_TFOOT || t === T.T_THEAD || t === T.T_TR) {
        const stack = this.stack;
        let lastTemplate = -1;
        let lastTable = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
          const h = stack[i];
          if (this.hNs[h] !== NS_HTML) continue;
          if (lastTemplate < 0 && this.hTag[h] === T.T_TEMPLATE) lastTemplate = i;
          if (lastTable < 0 && this.hTag[h] === T.T_TABLE) lastTable = i;
          if (lastTemplate >= 0 && lastTable >= 0) break;
        }
        if (lastTemplate >= 0 && (lastTable < 0 || lastTemplate > lastTable)) {
          target = stack[lastTemplate];
        } else if (lastTable < 0) {
          this.locParent = stack[0];
          return;
        } else if (this.sink.hasParent(stack[lastTable])) {
          this.locParent = -1;
          this.locRef = stack[lastTable];
          return;
        } else {
          target = stack[lastTable - 1];
        }
      }
    }
    if (this.hNs[target] === NS_HTML && this.hTag[target] === T.T_TEMPLATE) {
      const contents = this.hContents[target];
      if (contents >= 0) target = contents;
    }
    this.locParent = target;
  }

  /** https://html.spec.whatwg.org/#insert-a-character */
  private insertChars(s: string): void {
    if (s.length === 0) return;
    this.appropriatePlace(-1);
    if (this.locParent === this.docHandle) return;
    this.sink.insertText(this.locParent, this.locRef, s);
  }

  /** https://html.spec.whatwg.org/#insert-a-comment */
  private insertComment(parent: number): void {
    if (parent >= 0) {
      this.sink.insertComment(parent, -1, this.tok.data);
      return;
    }
    this.appropriatePlace(-1);
    this.sink.insertComment(this.locParent, this.locRef, this.tok.data);
  }

  private insertPI(parent: number): void {
    if (parent >= 0) {
      this.sink.insertProcessingInstruction(parent, -1, this.tok.name, this.tok.data);
      return;
    }
    this.appropriatePlace(-1);
    this.sink.insertProcessingInstruction(this.locParent, this.locRef, this.tok.name, this.tok.data);
  }

  private recordElement(h: number, ns: number, tag: number, name: string): void {
    if (h === this.hNs.length) {
      this.hNs.push(ns);
      this.hTag.push(tag);
      this.hName.push(name);
      this.hIP.push(false);
      this.hContents.push(-1);
    } else {
      this.setMeta(h, ns, tag, name, false);
    }
  }

  /**
   * https://html.spec.whatwg.org/#create-an-element-for-the-token in the HTML namespace,
   * with the attributes of the current token (or none), intended parent = locParent/locRef.
   */
  private createHtmlElement(name: string, tag: number, withAttrs: boolean): number {
    const tok = this.tok;
    const h = this.sink.createElement(
      name,
      NS_HTML,
      this.locParent,
      this.locRef,
      withAttrs ? tok.attrNames : this.emptyStrings,
      withAttrs ? tok.attrValues : this.emptyStrings,
      this.emptyNumbers,
      withAttrs ? tok.attrCount : 0,
      false,
    );
    this.recordElement(h, NS_HTML, tag, name);
    if (tag === T.T_TEMPLATE) this.hContents[h] = this.sink.templateContents(h);
    // Form owner association for form-associated elements.
    const form = this.formElement;
    if (form >= 0 && (props[tag] & B_FORM_ASSOCIATED) !== 0 && this.fragmentContext < 0 && !this.parsingTemplateContents()) {
      if ((props[tag] & B_LISTED) === 0 || !withAttrs || !this.tokenHasAttr("form")) this.sink.associateForm(h, form);
    }
    return h;
  }

  private tokenHasAttr(name: string): boolean {
    const tok = this.tok;
    for (let i = 0; i < tok.attrCount; i++) if (tok.attrNames[i] === name) return true;
    return false;
  }

  private tokenAttr(name: string): string | null {
    const tok = this.tok;
    for (let i = 0; i < tok.attrCount; i++) if (tok.attrNames[i] === name) return tok.attrValues[i];
    return null;
  }

  /** https://html.spec.whatwg.org/#insert-an-html-element for the current token. */
  private insertHtmlElement(): number {
    this.appropriatePlace(-1);
    const tok = this.tok;
    const h = this.createHtmlElement(tok.name, tok.tagId, true);
    this.sink.insert(this.locParent, this.locRef, h);
    this.stack.push(h);
    return h;
  }

  /** Insert an HTML element for a start tag token with this name and no attributes. */
  private insertHtmlElementNamed(name: string, tag: number): number {
    this.appropriatePlace(-1);
    const h = this.createHtmlElement(name, tag, false);
    this.sink.insert(this.locParent, this.locRef, h);
    this.stack.push(h);
    return h;
  }

  private insertVoidHtmlElement(): void {
    this.insertHtmlElement();
    this.stack.pop();
  }

  /** https://html.spec.whatwg.org/#insert-a-foreign-element with attribute adjustments. */
  private insertForeignElement(ns: number, adjustNames: boolean): number {
    const tok = this.tok;
    let name = tok.name;
    if (ns === NS_SVG && adjustNames) {
      const adjusted = svgTagMap.get(name);
      if (adjusted !== undefined) name = adjusted;
    }
    // Attributes: MathML / SVG case fixes and foreign (namespaced) attributes.
    const names = this.fNames;
    const values = this.fValues;
    const nss = this.fNs;
    names.length = 0;
    values.length = 0;
    nss.length = 0;
    let encoding = "";
    for (let i = 0; i < tok.attrCount; i++) {
      let an = tok.attrNames[i];
      const av = tok.attrValues[i];
      let ans = ANS_NONE;
      if (ns === NS_MATHML) {
        if (an === "definitionurl") an = "definitionURL";
        else if (an === "encoding") encoding = av;
      } else if (ns === NS_SVG) {
        const fixed = svgAttrMap.get(an);
        if (fixed !== undefined) an = fixed;
      }
      // https://html.spec.whatwg.org/#adjust-foreign-attributes
      if (an.charCodeAt(0) === 120) {
        if (an === "xlink:actuate" || an === "xlink:arcrole" || an === "xlink:href" || an === "xlink:role" ||
          an === "xlink:show" || an === "xlink:title" || an === "xlink:type") {
          ans = ANS_XLINK;
          an = an.slice(6);
        } else if (an === "xml:lang" || an === "xml:space") {
          ans = ANS_XML;
          an = an.slice(4);
        } else if (an === "xmlns") {
          ans = ANS_XMLNS;
        } else if (an === "xmlns:xlink") {
          ans = ANS_XMLNS;
          an = "xlink";
        }
      }
      names.push(an);
      values.push(av);
      nss.push(ans);
    }
    this.appropriatePlace(-1);
    const h = this.sink.createElement(name, ns, this.locParent, this.locRef, names, values, nss, names.length, true);
    this.recordElement(h, ns, 0, name);
    this.setForeignFacts(h, ns, name, encoding);
    this.sink.insert(this.locParent, this.locRef, h);
    this.stack.push(h);
    return h;
  }

  // --- active formatting elements -------------------------------------------------------------

  private storeToken(): number {
    const tok = this.tok;
    const index = this.ptName.length;
    this.ptName.push(tok.name);
    this.ptId.push(tok.tagId);
    this.ptAttrStart.push(this.poolNames.length);
    this.ptAttrCount.push(tok.attrCount);
    for (let i = 0; i < tok.attrCount; i++) {
      this.poolNames.push(tok.attrNames[i]);
      this.poolValues.push(tok.attrValues[i]);
    }
    return index;
  }

  /** Same tag name and attributes (order-insensitive) as the current token? */
  private sameAsToken(t: number): boolean {
    const tok = this.tok;
    if (this.ptName[t] !== tok.name) return false;
    const count = this.ptAttrCount[t];
    if (count !== tok.attrCount) return false;
    const start = this.ptAttrStart[t];
    for (let i = 0; i < count; i++) {
      const n = this.poolNames[start + i];
      let found = false;
      for (let j = 0; j < count; j++) {
        if (tok.attrNames[j] === n) {
          found = tok.attrValues[j] === this.poolValues[start + i];
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }

  /** https://html.spec.whatwg.org/#push-onto-the-list-of-active-formatting-elements */
  private pushFormatting(h: number): void {
    const afe = this.afe;
    let count = 0;
    let earliest = -1;
    for (let i = afe.length - 1; i >= 0; i--) {
      if (afe[i] === -1) break;
      if (this.sameAsToken(this.afeTok[i])) {
        count++;
        earliest = i;
      }
    }
    if (count >= 3) {
      afe.splice(earliest, 1);
      this.afeTok.splice(earliest, 1);
    }
    afe.push(h);
    this.afeTok.push(this.storeToken());
  }

  private insertMarker(): void {
    this.afe.push(-1);
    this.afeTok.push(-1);
  }

  /** https://html.spec.whatwg.org/#clear-the-list-of-active-formatting-elements-up-to-the-last-marker */
  private clearToLastMarker(): void {
    const afe = this.afe;
    while (afe.length !== 0) {
      this.afeTok.pop();
      if ((afe.pop() as number) === -1) return;
    }
  }

  private afeIndexOf(h: number): number {
    const afe = this.afe;
    for (let i = afe.length - 1; i >= 0; i--) if (afe[i] === h) return i;
    return -1;
  }

  /** Create an element for a stored formatting token (no insertion). */
  private createFromStored(t: number): number {
    const start = this.ptAttrStart[t];
    const count = this.ptAttrCount[t];
    let names = this.emptyStrings;
    let values = this.emptyStrings;
    if (count !== 0) {
      names = this.poolNames.slice(start, start + count);
      values = this.poolValues.slice(start, start + count);
    }
    const name = this.ptName[t];
    const tag = this.ptId[t];
    const h = this.sink.createElement(name, NS_HTML, this.locParent, this.locRef, names, values, this.emptyNumbers, count, false);
    this.recordElement(h, NS_HTML, tag, name);
    return h;
  }

  /** https://html.spec.whatwg.org/#reconstruct-the-active-formatting-elements */
  private reconstructFormatting(): void {
    const afe = this.afe;
    const n = afe.length;
    if (n === 0) return;
    let e = afe[n - 1];
    if (e === -1 || this.stackIndexOf(e) >= 0) return;
    let i = n - 1;
    while (i > 0) {
      i--;
      e = afe[i];
      if (e === -1 || this.stackIndexOf(e) >= 0) {
        i++;
        break;
      }
    }
    for (; i < afe.length; i++) {
      this.appropriatePlace(-1);
      const h = this.createFromStored(this.afeTok[i]);
      this.sink.insert(this.locParent, this.locRef, h);
      this.stack.push(h);
      afe[i] = h;
    }
  }

  /** https://html.spec.whatwg.org/#adoption-agency-algorithm */
  private adoptionAgency(): void {
    const stack = this.stack;
    const afe = this.afe;
    const current = this.currentNode();
    if (this.isHtmlNamedAsToken(current) && this.afeIndexOf(current) < 0) {
      stack.pop();
      return;
    }
    for (let outer = 0; outer < 8; outer++) {
      let fi = -1;
      for (let i = afe.length - 1; i >= 0; i--) {
        const e = afe[i];
        if (e === -1) break;
        if (this.isHtmlNamedAsToken(e)) {
          fi = i;
          break;
        }
      }
      if (fi < 0) {
        this.anyOtherEndTagInBody();
        return;
      }
      const fe = afe[fi];
      // (fi is re-resolved after the inner loop, which can remove list entries.)
      const si = this.stackIndexOf(fe);
      if (si < 0) {
        afe.splice(fi, 1);
        this.afeTok.splice(fi, 1);
        return;
      }
      if (!this.nodeInScope(fe)) return;
      let fbIndex = -1;
      for (let i = si + 1; i < stack.length; i++) {
        if (this.isSpecial(stack[i])) {
          fbIndex = i;
          break;
        }
      }
      if (fbIndex < 0) {
        stack.length = si;
        afe.splice(fi, 1);
        this.afeTok.splice(fi, 1);
        return;
      }
      const fb = stack[fbIndex];
      const commonAncestor = stack[si - 1];
      let bookmark = fi;
      let node = fb;
      let lastNode = fb;
      let nodeIndex = fbIndex;
      let inner = 0;
      for (;;) {
        inner++;
        nodeIndex--;
        node = stack[nodeIndex];
        if (node === fe) break;
        let ai = this.afeIndexOf(node);
        if (inner > 3 && ai >= 0) {
          afe.splice(ai, 1);
          this.afeTok.splice(ai, 1);
          if (ai < bookmark) bookmark--;
          ai = -1;
        }
        if (ai < 0) {
          stack.splice(nodeIndex, 1);
          continue;
        }
        this.locParent = commonAncestor;
        this.locRef = -1;
        const created = this.createFromStored(this.afeTok[ai]);
        afe[ai] = created;
        stack[nodeIndex] = created;
        node = created;
        if (lastNode === fb) bookmark = ai + 1;
        this.sink.insert(node, -1, lastNode);
        lastNode = node;
      }
      this.appropriatePlace(commonAncestor);
      this.sink.insert(this.locParent, this.locRef, lastNode);
      fi = this.afeIndexOf(fe);
      this.locParent = fb;
      this.locRef = -1;
      const feTok = this.afeTok[fi];
      const newElement = this.createFromStored(feTok);
      this.sink.reparentChildren(fb, newElement);
      this.sink.insert(fb, -1, newElement);
      afe.splice(fi, 1);
      this.afeTok.splice(fi, 1);
      if (fi < bookmark) bookmark--;
      afe.splice(bookmark, 0, newElement);
      this.afeTok.splice(bookmark, 0, feTok);
      stack.splice(this.stackIndexOf(fe), 1);
      stack.splice(this.stackIndexOf(fb) + 1, 0, newElement);
    }
  }

  // --- character token helpers -------------------------------------------------------------

  /** Advance cpos over whitespace; returns true if characters remain. */
  private skipWs(): boolean {
    const s = this.chars;
    let i = this.cpos;
    while (i < s.length && isWsCode(s.charCodeAt(i))) i++;
    this.cpos = i;
    return i < s.length;
  }

  /** Insert leading whitespace; returns true if characters remain. */
  private insertLeadingWs(): boolean {
    const s = this.chars;
    const start = this.cpos;
    let i = start;
    while (i < s.length && isWsCode(s.charCodeAt(i))) i++;
    if (i > start) this.insertChars(start === 0 && i === s.length ? s : s.slice(start, i));
    this.cpos = i;
    return i < s.length;
  }

  private restChars(): string {
    return this.cpos === 0 ? this.chars : this.chars.slice(this.cpos);
  }

  /** "in body" character handling for a string. */
  private bodyChars(s: string): void {
    if (this.charsHasNull) s = removeNulls(s);
    if (s.length === 0) return;
    this.reconstructFormatting();
    this.insertChars(s);
    if (this.framesetOk && !isAllWs(s)) this.framesetOk = false;
  }

  // --- insertion modes -------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#the-initial-insertion-mode */
  private initial(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        if (!this.skipWs()) return;
        break;
      case TK_COMMENT:
        this.insertComment(this.docHandle);
        return;
      case TK_PI:
        this.insertPI(this.docHandle);
        return;
      case TK_DOCTYPE: {
        this.sink.insertDoctype(this.docHandle, tok.hasName ? tok.name : "", tok.publicId, tok.systemId);
        if (!this.iframeSrcdoc) {
          const m = this.doctypeMode();
          if (m !== MODE_NO_QUIRKS) this.setDocumentMode(m);
        }
        this.mode = M_BEFORE_HTML;
        return;
      }
    }
    if (!this.iframeSrcdoc) this.setDocumentMode(MODE_QUIRKS);
    this.mode = M_BEFORE_HTML;
    this.reprocess = true;
  }

  private setDocumentMode(m: number): void {
    this.documentMode = m;
    this.sink.setDocumentMode(m);
  }

  private doctypeMode(): number {
    const tok = this.tok;
    if (tok.forceQuirks || !tok.hasName || tok.name !== "html") return MODE_QUIRKS;
    const pub = tok.hasPublicId ? asciiLower(tok.publicId) : "";
    const sys = tok.hasSystemId ? asciiLower(tok.systemId) : "";
    if (tok.hasPublicId) {
      if (pub === "-//w3o//dtd w3 html strict 3.0//en//" || pub === "-/w3c/dtd html 4.0 transitional/en" || pub === "html") {
        return MODE_QUIRKS;
      }
      for (let i = 0; i < QUIRKS_PUBLIC_PREFIXES.length; i++) {
        if (pub.startsWith(QUIRKS_PUBLIC_PREFIXES[i])) return MODE_QUIRKS;
      }
    }
    if (tok.hasSystemId && sys === "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd") return MODE_QUIRKS;
    if (tok.hasPublicId) {
      const html401 = pub.startsWith("-//w3c//dtd html 4.01 frameset//") || pub.startsWith("-//w3c//dtd html 4.01 transitional//");
      const sysMissingOrEmpty = !tok.hasSystemId || sys === "";
      if (sysMissingOrEmpty && html401) return MODE_QUIRKS;
      if (pub.startsWith("-//w3c//dtd xhtml 1.0 frameset//") || pub.startsWith("-//w3c//dtd xhtml 1.0 transitional//")) {
        return MODE_LIMITED_QUIRKS;
      }
      if (!sysMissingOrEmpty && html401) return MODE_LIMITED_QUIRKS;
    }
    return MODE_NO_QUIRKS;
  }

  /** https://html.spec.whatwg.org/#the-before-html-insertion-mode */
  private beforeHtml(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_DOCTYPE:
        return;
      case TK_COMMENT:
        this.insertComment(this.docHandle);
        return;
      case TK_PI:
        this.insertPI(this.docHandle);
        return;
      case TK_CHARS:
        if (!this.skipWs()) return;
        break;
      case TK_START:
        if (tok.tagId === T.T_HTML) {
          this.locParent = this.docHandle;
          this.locRef = -1;
          const h = this.createHtmlElement("html", T.T_HTML, true);
          this.sink.insert(this.docHandle, -1, h);
          this.stack.push(h);
          this.mode = M_BEFORE_HEAD;
          return;
        }
        break;
      case TK_END: {
        const id = tok.tagId;
        if (id !== T.T_HEAD && id !== T.T_BODY && id !== T.T_HTML && id !== T.T_BR) return;
        break;
      }
    }
    this.locParent = this.docHandle;
    this.locRef = -1;
    const h = this.createHtmlElement("html", T.T_HTML, false);
    this.sink.insert(this.docHandle, -1, h);
    this.stack.push(h);
    this.mode = M_BEFORE_HEAD;
    this.reprocess = true;
  }

  /** https://html.spec.whatwg.org/#the-before-head-insertion-mode */
  private beforeHead(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        if (!this.skipWs()) return;
        break;
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_DOCTYPE:
        return;
      case TK_START:
        if (tok.tagId === T.T_HTML) {
          this.inBody();
          return;
        }
        if (tok.tagId === T.T_HEAD) {
          this.headElement = this.insertHtmlElement();
          this.mode = M_IN_HEAD;
          return;
        }
        break;
      case TK_END: {
        const id = tok.tagId;
        if (id !== T.T_HEAD && id !== T.T_BODY && id !== T.T_HTML && id !== T.T_BR) return;
        break;
      }
    }
    this.headElement = this.insertHtmlElementNamed("head", T.T_HEAD);
    this.mode = M_IN_HEAD;
    this.reprocess = true;
  }

  /** https://html.spec.whatwg.org/#generic-raw-text-element-parsing-algorithm */
  private genericTextElement(state: number): void {
    this.insertHtmlElement();
    this.tok.state = state;
    this.originalMode = this.mode;
    this.mode = M_TEXT;
  }

  /** https://html.spec.whatwg.org/#parsing-main-inhead */
  private inHead(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        if (!this.insertLeadingWs()) return;
        break;
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_DOCTYPE:
        return;
      case TK_START:
        switch (tok.tagId) {
          case T.T_HTML:
            this.inBody();
            return;
          case T.T_BASE:
          case T.T_BASEFONT:
          case T.T_BGSOUND:
          case T.T_LINK:
          case T.T_META:
            this.insertVoidHtmlElement();
            return;
          case T.T_TITLE:
            this.genericTextElement(S_RCDATA);
            return;
          case T.T_NOSCRIPT:
            if (this.scripting) {
              this.genericTextElement(S_RAWTEXT);
            } else {
              this.insertHtmlElement();
              this.mode = M_IN_HEAD_NOSCRIPT;
            }
            return;
          case T.T_NOFRAMES:
          case T.T_STYLE:
            this.genericTextElement(S_RAWTEXT);
            return;
          case T.T_SCRIPT:
            this.genericTextElement(S_SCRIPT_DATA);
            return;
          case T.T_TEMPLATE:
            this.templateStartTag();
            return;
          case T.T_HEAD:
            return;
        }
        break;
      case TK_END:
        switch (tok.tagId) {
          case T.T_HEAD:
            this.pop();
            this.mode = M_AFTER_HEAD;
            return;
          case T.T_BODY:
          case T.T_HTML:
          case T.T_BR:
            break;
          case T.T_TEMPLATE:
            this.templateEndTag();
            return;
          default:
            return;
        }
        break;
    }
    this.pop();
    this.mode = M_AFTER_HEAD;
    this.reprocess = true;
  }

  /** "in head": a start tag whose tag name is "template". */
  private templateStartTag(): void {
    this.insertMarker();
    this.framesetOk = false;
    this.mode = M_IN_TEMPLATE;
    this.templateModes.push(M_IN_TEMPLATE);
    const host = this.currentNode();
    const hostIsRoot = host === this.stack[0];
    const mode = this.allowDSD && !hostIsRoot ? this.tokenAttr("shadowrootmode") : null;
    const lowerMode = mode === null ? "" : asciiLower(mode);
    if (lowerMode === "open" || lowerMode === "closed") {
      this.appropriatePlace(-1);
      const shadow = this.sink.attachDeclarativeShadowRoot(
        host,
        lowerMode,
        this.tokenHasAttr("shadowrootdelegatesfocus"),
        this.tokenHasAttr("shadowrootserializable"),
        asciiLower(this.tokenAttr("shadowrootslotassignment") ?? "") === "manual" ? "manual" : "named",
        this.tokenHasAttr("shadowrootclonable"),
      );
      if (shadow >= 0) {
        // The template element is created but not inserted; its contents are the shadow root.
        const h = this.createHtmlElement(this.tok.name, T.T_TEMPLATE, true);
        this.recordElement(shadow, NS_HTML, 0, "#shadow-root");
        this.hContents[h] = shadow;
        this.stack.push(h);
        return;
      }
    }
    this.insertHtmlElement();
  }

  /** "in head": an end tag whose tag name is "template". */
  private templateEndTag(): void {
    if (!this.templateInStack()) return;
    this.generateImpliedEndTagsThoroughly();
    this.popUntil(T.T_TEMPLATE);
    this.clearToLastMarker();
    this.templateModes.pop();
    this.resetInsertionMode();
  }

  /** https://html.spec.whatwg.org/#parsing-main-inheadnoscript */
  private inHeadNoscript(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_DOCTYPE:
        return;
      case TK_START:
        switch (tok.tagId) {
          case T.T_HTML:
            this.inBody();
            return;
          case T.T_BASEFONT:
          case T.T_BGSOUND:
          case T.T_LINK:
          case T.T_META:
          case T.T_NOFRAMES:
          case T.T_STYLE:
            this.inHead();
            return;
          case T.T_HEAD:
          case T.T_NOSCRIPT:
            return;
        }
        break;
      case TK_END:
        if (tok.tagId === T.T_NOSCRIPT) {
          this.pop();
          this.mode = M_IN_HEAD;
          return;
        }
        if (tok.tagId !== T.T_BR) return;
        break;
      case TK_CHARS: {
        // Whitespace is processed using the "in head" rules (inserted).
        if (!this.insertLeadingWs()) return;
        break;
      }
      case TK_COMMENT:
      case TK_PI:
        this.inHead();
        return;
    }
    this.pop();
    this.mode = M_IN_HEAD;
    this.reprocess = true;
  }

  /** https://html.spec.whatwg.org/#the-after-head-insertion-mode */
  private afterHead(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        if (!this.insertLeadingWs()) return;
        break;
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_DOCTYPE:
        return;
      case TK_START:
        switch (tok.tagId) {
          case T.T_HTML:
            this.inBody();
            return;
          case T.T_BODY:
            this.insertHtmlElement();
            this.framesetOk = false;
            this.mode = M_IN_BODY;
            return;
          case T.T_FRAMESET:
            this.insertHtmlElement();
            this.mode = M_IN_FRAMESET;
            return;
          case T.T_BASE:
          case T.T_BASEFONT:
          case T.T_BGSOUND:
          case T.T_LINK:
          case T.T_META:
          case T.T_NOFRAMES:
          case T.T_SCRIPT:
          case T.T_STYLE:
          case T.T_TEMPLATE:
          case T.T_TITLE: {
            const head = this.headElement;
            this.stack.push(head);
            this.inHead();
            const i = this.stackIndexOf(head);
            if (i >= 0) this.stack.splice(i, 1);
            return;
          }
          case T.T_HEAD:
            return;
        }
        break;
      case TK_END:
        switch (tok.tagId) {
          case T.T_TEMPLATE:
            this.inHead();
            return;
          case T.T_BODY:
          case T.T_HTML:
          case T.T_BR:
            break;
          default:
            return;
        }
        break;
    }
    this.insertHtmlElementNamed("body", T.T_BODY);
    this.framesetOk = true;
    this.mode = M_IN_BODY;
    this.reprocess = true;
  }

  /** https://html.spec.whatwg.org/#parsing-main-inbody */
  private inBody(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        this.bodyChars(this.restChars());
        return;
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_DOCTYPE:
        return;
      case TK_EOF:
        if (this.templateModes.length !== 0) {
          this.inTemplate();
          return;
        }
        this.stopped = true;
        return;
      case TK_START:
        this.inBodyStartTag();
        return;
      case TK_END:
        this.inBodyEndTag();
        return;
    }
  }

  private inBodyStartTag(): void {
    const tok = this.tok;
    const stack = this.stack;
    switch (tok.tagId) {
      case T.T_HTML:
        if (this.templateInStack()) return;
        this.sink.addMissingAttributes(stack[0], tok.attrNames, tok.attrValues, tok.attrCount);
        return;
      case T.T_BASE:
      case T.T_BASEFONT:
      case T.T_BGSOUND:
      case T.T_LINK:
      case T.T_META:
      case T.T_NOFRAMES:
      case T.T_SCRIPT:
      case T.T_STYLE:
      case T.T_TEMPLATE:
      case T.T_TITLE:
        this.inHead();
        return;
      case T.T_BODY:
        if (stack.length === 1 || !this.isHtml(stack[1], T.T_BODY) || this.templateInStack()) return;
        this.framesetOk = false;
        this.sink.addMissingAttributes(stack[1], tok.attrNames, tok.attrValues, tok.attrCount);
        return;
      case T.T_FRAMESET:
        if (stack.length === 1 || !this.isHtml(stack[1], T.T_BODY)) return;
        if (!this.framesetOk) return;
        this.sink.remove(stack[1]);
        stack.length = 1;
        this.insertHtmlElement();
        this.mode = M_IN_FRAMESET;
        return;
      case T.T_ADDRESS:
      case T.T_ARTICLE:
      case T.T_ASIDE:
      case T.T_BLOCKQUOTE:
      case T.T_CENTER:
      case T.T_DETAILS:
      case T.T_DIALOG:
      case T.T_DIR:
      case T.T_DIV:
      case T.T_DL:
      case T.T_FIELDSET:
      case T.T_FIGCAPTION:
      case T.T_FIGURE:
      case T.T_FOOTER:
      case T.T_HEADER:
      case T.T_HGROUP:
      case T.T_MAIN:
      case T.T_MENU:
      case T.T_NAV:
      case T.T_OL:
      case T.T_P:
      case T.T_SEARCH:
      case T.T_SECTION:
      case T.T_SUMMARY:
      case T.T_UL:
        this.closePIfInButtonScope();
        this.insertHtmlElement();
        return;
      case T.T_H1:
      case T.T_H2:
      case T.T_H3:
      case T.T_H4:
      case T.T_H5:
      case T.T_H6: {
        this.closePIfInButtonScope();
        const cur = this.currentNode();
        const t = this.hTag[cur];
        if (this.hNs[cur] === NS_HTML && t >= T.T_H1 && t <= T.T_H6) this.pop();
        this.insertHtmlElement();
        return;
      }
      case T.T_PRE:
      case T.T_LISTING:
        this.closePIfInButtonScope();
        this.insertHtmlElement();
        this.skipNewline = true;
        this.framesetOk = false;
        return;
      case T.T_FORM: {
        const inTemplate = this.parsingTemplateContents();
        if (this.formElement >= 0 && !inTemplate) return;
        this.closePIfInButtonScope();
        const h = this.insertHtmlElement();
        if (!inTemplate) this.formElement = h;
        return;
      }
      case T.T_LI:
      case T.T_DD:
      case T.T_DT: {
        this.framesetOk = false;
        const isLi = tok.tagId === T.T_LI;
        for (let i = stack.length - 1; i >= 0; i--) {
          const node = stack[i];
          const t = this.hNs[node] === NS_HTML ? this.hTag[node] : -1;
          if (isLi ? t === T.T_LI : t === T.T_DD || t === T.T_DT) {
            this.generateImpliedEndTags(t);
            this.popUntil(t);
            break;
          }
          if (this.isSpecial(node) && t !== T.T_ADDRESS && t !== T.T_DIV && t !== T.T_P) break;
        }
        this.closePIfInButtonScope();
        this.insertHtmlElement();
        return;
      }
      case T.T_PLAINTEXT:
        this.closePIfInButtonScope();
        this.insertHtmlElement();
        tok.state = S_PLAINTEXT;
        return;
      case T.T_BUTTON:
        if (this.inScope(T.T_BUTTON, 0)) {
          this.generateImpliedEndTags(0);
          this.popUntil(T.T_BUTTON);
        }
        this.reconstructFormatting();
        this.insertHtmlElement();
        this.framesetOk = false;
        return;
      case T.T_A: {
        const afe = this.afe;
        for (let i = afe.length - 1; i >= 0; i--) {
          const e = afe[i];
          if (e === -1) break;
          if (this.isHtml(e, T.T_A)) {
            this.adoptionAgency();
            const ai = this.afeIndexOf(e);
            if (ai >= 0) {
              afe.splice(ai, 1);
              this.afeTok.splice(ai, 1);
            }
            const si = this.stackIndexOf(e);
            if (si >= 0) stack.splice(si, 1);
            break;
          }
        }
        this.reconstructFormatting();
        this.pushFormatting(this.insertHtmlElement());
        return;
      }
      case T.T_B:
      case T.T_BIG:
      case T.T_CODE:
      case T.T_EM:
      case T.T_FONT:
      case T.T_I:
      case T.T_S:
      case T.T_SMALL:
      case T.T_STRIKE:
      case T.T_STRONG:
      case T.T_TT:
      case T.T_U:
        this.reconstructFormatting();
        this.pushFormatting(this.insertHtmlElement());
        return;
      case T.T_NOBR:
        this.reconstructFormatting();
        if (this.inScope(T.T_NOBR, 0)) {
          this.adoptionAgency();
          this.reconstructFormatting();
        }
        this.pushFormatting(this.insertHtmlElement());
        return;
      case T.T_APPLET:
      case T.T_MARQUEE:
      case T.T_OBJECT:
        this.reconstructFormatting();
        this.insertHtmlElement();
        this.insertMarker();
        this.framesetOk = false;
        return;
      case T.T_TABLE:
        if (this.documentMode !== MODE_QUIRKS) this.closePIfInButtonScope();
        this.insertHtmlElement();
        this.framesetOk = false;
        this.mode = M_IN_TABLE;
        return;
      case T.T_AREA:
      case T.T_BR:
      case T.T_EMBED:
      case T.T_IMG:
      case T.T_KEYGEN:
      case T.T_WBR:
        this.reconstructFormatting();
        this.insertVoidHtmlElement();
        this.framesetOk = false;
        return;
      case T.T_INPUT: {
        const ctx = this.fragmentContext;
        if (ctx >= 0 && this.isHtml(ctx, T.T_SELECT)) return;
        if (this.inScope(T.T_SELECT, 0)) this.popUntil(T.T_SELECT);
        this.reconstructFormatting();
        this.insertVoidHtmlElement();
        const type = this.tokenAttr("type");
        if (type === null || asciiLower(type) !== "hidden") this.framesetOk = false;
        return;
      }
      case T.T_PARAM:
      case T.T_SOURCE:
      case T.T_TRACK:
        this.insertVoidHtmlElement();
        return;
      case T.T_HR:
        this.closePIfInButtonScope();
        if (this.inScope(T.T_SELECT, 0)) this.generateImpliedEndTags(0);
        this.insertVoidHtmlElement();
        this.framesetOk = false;
        return;
      case T.T_IMAGE:
        tok.name = "img";
        tok.tagId = T.T_IMG;
        this.reprocess = true;
        return;
      case T.T_TEXTAREA:
        this.insertHtmlElement();
        this.skipNewline = true;
        tok.state = S_RCDATA;
        this.originalMode = this.mode;
        this.framesetOk = false;
        this.mode = M_TEXT;
        return;
      case T.T_XMP:
        this.closePIfInButtonScope();
        this.reconstructFormatting();
        this.framesetOk = false;
        this.genericTextElement(S_RAWTEXT);
        return;
      case T.T_IFRAME:
        this.framesetOk = false;
        this.genericTextElement(S_RAWTEXT);
        return;
      case T.T_NOEMBED:
        this.genericTextElement(S_RAWTEXT);
        return;
      case T.T_NOSCRIPT:
        if (this.scripting) {
          this.genericTextElement(S_RAWTEXT);
          return;
        }
        break;
      case T.T_SELECT: {
        const ctx = this.fragmentContext;
        if (ctx >= 0 && this.isHtml(ctx, T.T_SELECT)) return;
        if (this.inScope(T.T_SELECT, 0)) {
          this.popUntil(T.T_SELECT);
          return;
        }
        this.reconstructFormatting();
        this.insertHtmlElement();
        this.framesetOk = false;
        return;
      }
      case T.T_OPTION:
        if (this.inScope(T.T_SELECT, 0)) {
          this.generateImpliedEndTags(T.T_OPTGROUP);
        } else if (this.currentIs(T.T_OPTION)) {
          this.pop();
        }
        this.reconstructFormatting();
        this.insertHtmlElement();
        return;
      case T.T_OPTGROUP:
        if (this.inScope(T.T_SELECT, 0)) {
          this.generateImpliedEndTags(0);
        } else if (this.currentIs(T.T_OPTION)) {
          this.pop();
        }
        this.reconstructFormatting();
        this.insertHtmlElement();
        return;
      case T.T_RB:
      case T.T_RTC:
        if (this.inScope(T.T_RUBY, 0)) this.generateImpliedEndTags(0);
        this.insertHtmlElement();
        return;
      case T.T_RP:
      case T.T_RT:
        if (this.inScope(T.T_RUBY, 0)) this.generateImpliedEndTags(T.T_RTC);
        this.insertHtmlElement();
        return;
      case T.T_MATH:
        this.reconstructFormatting();
        this.insertForeignElement(NS_MATHML, false);
        if (tok.selfClosing) this.pop();
        return;
      case T.T_SVG:
        this.reconstructFormatting();
        this.insertForeignElement(NS_SVG, false);
        if (tok.selfClosing) this.pop();
        return;
      case T.T_CAPTION:
      case T.T_COL:
      case T.T_COLGROUP:
      case T.T_FRAME:
      case T.T_HEAD:
      case T.T_TBODY:
      case T.T_TD:
      case T.T_TFOOT:
      case T.T_TH:
      case T.T_THEAD:
      case T.T_TR:
        return;
    }
    this.reconstructFormatting();
    this.insertHtmlElement();
  }

  private inBodyEndTag(): void {
    const tok = this.tok;
    switch (tok.tagId) {
      case T.T_TEMPLATE:
        this.inHead();
        return;
      case T.T_BODY:
        if (!this.inScope(T.T_BODY, 0)) return;
        this.mode = M_AFTER_BODY;
        return;
      case T.T_HTML:
        if (!this.inScope(T.T_BODY, 0)) return;
        this.mode = M_AFTER_BODY;
        this.reprocess = true;
        return;
      case T.T_ADDRESS:
      case T.T_ARTICLE:
      case T.T_ASIDE:
      case T.T_BLOCKQUOTE:
      case T.T_BUTTON:
      case T.T_CENTER:
      case T.T_DETAILS:
      case T.T_DIALOG:
      case T.T_DIR:
      case T.T_DIV:
      case T.T_DL:
      case T.T_FIELDSET:
      case T.T_FIGCAPTION:
      case T.T_FIGURE:
      case T.T_FOOTER:
      case T.T_HEADER:
      case T.T_HGROUP:
      case T.T_LISTING:
      case T.T_MAIN:
      case T.T_MENU:
      case T.T_NAV:
      case T.T_OL:
      case T.T_PRE:
      case T.T_SEARCH:
      case T.T_SECTION:
      case T.T_SELECT:
      case T.T_SUMMARY:
      case T.T_UL: {
        const id = tok.tagId;
        if (!this.inScope(id, 0)) return;
        this.generateImpliedEndTags(0);
        this.popUntil(id);
        return;
      }
      case T.T_FORM:
        if (!this.parsingTemplateContents()) {
          const node = this.formElement;
          this.formElement = -1;
          if (node < 0 || !this.nodeInScope(node)) return;
          this.generateImpliedEndTags(0);
          const i = this.stackIndexOf(node);
          if (i >= 0) this.stack.splice(i, 1);
        } else {
          if (!this.inScope(T.T_FORM, 0)) return;
          this.generateImpliedEndTags(0);
          this.popUntil(T.T_FORM);
        }
        return;
      case T.T_P:
        if (!this.inScope(T.T_P, B_BUTTON_SCOPE)) this.insertHtmlElementNamed("p", T.T_P);
        this.closePElement();
        return;
      case T.T_LI:
        if (!this.inScope(T.T_LI, B_LIST_SCOPE)) return;
        this.generateImpliedEndTags(T.T_LI);
        this.popUntil(T.T_LI);
        return;
      case T.T_DD:
      case T.T_DT: {
        const id = tok.tagId;
        if (!this.inScope(id, 0)) return;
        this.generateImpliedEndTags(id);
        this.popUntil(id);
        return;
      }
      case T.T_H1:
      case T.T_H2:
      case T.T_H3:
      case T.T_H4:
      case T.T_H5:
      case T.T_H6: {
        if (
          !this.inScope(T.T_H1, 0) && !this.inScope(T.T_H2, 0) && !this.inScope(T.T_H3, 0) &&
          !this.inScope(T.T_H4, 0) && !this.inScope(T.T_H5, 0) && !this.inScope(T.T_H6, 0)
        ) {
          return;
        }
        this.generateImpliedEndTags(0);
        const stack = this.stack;
        while (stack.length !== 0) {
          const h = stack.pop() as number;
          const t = this.hTag[h];
          if (this.hNs[h] === NS_HTML && t >= T.T_H1 && t <= T.T_H6) break;
        }
        return;
      }
      case T.T_A:
      case T.T_B:
      case T.T_BIG:
      case T.T_CODE:
      case T.T_EM:
      case T.T_FONT:
      case T.T_I:
      case T.T_NOBR:
      case T.T_S:
      case T.T_SMALL:
      case T.T_STRIKE:
      case T.T_STRONG:
      case T.T_TT:
      case T.T_U:
        this.adoptionAgency();
        return;
      case T.T_APPLET:
      case T.T_MARQUEE:
      case T.T_OBJECT: {
        const id = tok.tagId;
        if (!this.inScope(id, 0)) return;
        this.generateImpliedEndTags(0);
        this.popUntil(id);
        this.clearToLastMarker();
        return;
      }
      case T.T_BR:
        // Act as a "br" start tag token with no attributes.
        tok.attrCount = 0;
        this.ttype = TK_START;
        this.reconstructFormatting();
        this.insertVoidHtmlElement();
        this.framesetOk = false;
        return;
    }
    this.anyOtherEndTagInBody();
  }

  private anyOtherEndTagInBody(): void {
    const stack = this.stack;
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i];
      if (this.isHtmlNamedAsToken(node)) {
        const id = this.tok.tagId;
        this.generateImpliedEndTags(id !== 0 ? id : -1);
        stack.length = i;
        return;
      }
      if (this.isSpecial(node)) return;
    }
  }

  /** https://html.spec.whatwg.org/#parsing-main-incdata */
  private text(): void {
    switch (this.ttype) {
      case TK_CHARS:
        this.insertChars(this.restChars());
        return;
      case TK_EOF:
        this.pop();
        this.mode = this.originalMode;
        this.reprocess = true;
        return;
      case TK_END:
        this.pop();
        this.mode = this.originalMode;
        return;
    }
  }

  /** https://html.spec.whatwg.org/#clear-the-stack-back-to-a-table-context */
  private clearStackBackTo(a: number, b: number, c: number): void {
    const stack = this.stack;
    for (;;) {
      const h = stack[stack.length - 1];
      if (this.hNs[h] === NS_HTML) {
        const t = this.hTag[h];
        if (t === a || t === b || t === c || t === T.T_TEMPLATE || t === T.T_HTML) return;
      }
      stack.pop();
    }
  }

  /** https://html.spec.whatwg.org/#parsing-main-intable */
  private inTable(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS: {
        const cur = this.currentNode();
        if (this.hNs[cur] === NS_HTML) {
          const t = this.hTag[cur];
          if (t === T.T_TABLE || t === T.T_TBODY || t === T.T_TEMPLATE || t === T.T_TFOOT || t === T.T_THEAD || t === T.T_TR) {
            this.pendingTableText = "";
            this.pendingTableNonWs = false;
            this.originalMode = this.mode;
            this.mode = M_IN_TABLE_TEXT;
            this.reprocess = true;
            return;
          }
        }
        break;
      }
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_DOCTYPE:
        return;
      case TK_START:
        switch (tok.tagId) {
          case T.T_CAPTION:
            this.clearStackBackTo(T.T_TABLE, T.T_TABLE, T.T_TABLE);
            this.insertMarker();
            this.insertHtmlElement();
            this.mode = M_IN_CAPTION;
            return;
          case T.T_COLGROUP:
            this.clearStackBackTo(T.T_TABLE, T.T_TABLE, T.T_TABLE);
            this.insertHtmlElement();
            this.mode = M_IN_COLUMN_GROUP;
            return;
          case T.T_COL:
            this.clearStackBackTo(T.T_TABLE, T.T_TABLE, T.T_TABLE);
            this.insertHtmlElementNamed("colgroup", T.T_COLGROUP);
            this.mode = M_IN_COLUMN_GROUP;
            this.reprocess = true;
            return;
          case T.T_TBODY:
          case T.T_TFOOT:
          case T.T_THEAD:
            this.clearStackBackTo(T.T_TABLE, T.T_TABLE, T.T_TABLE);
            this.insertHtmlElement();
            this.mode = M_IN_TABLE_BODY;
            return;
          case T.T_TD:
          case T.T_TH:
          case T.T_TR:
            this.clearStackBackTo(T.T_TABLE, T.T_TABLE, T.T_TABLE);
            this.insertHtmlElementNamed("tbody", T.T_TBODY);
            this.mode = M_IN_TABLE_BODY;
            this.reprocess = true;
            return;
          case T.T_TABLE:
            if (!this.inScope(T.T_TABLE, B_TABLE_SCOPE)) return;
            this.popUntil(T.T_TABLE);
            this.resetInsertionMode();
            this.reprocess = true;
            return;
          case T.T_STYLE:
          case T.T_SCRIPT:
          case T.T_TEMPLATE:
            this.inHead();
            return;
          case T.T_INPUT: {
            const type = this.tokenAttr("type");
            if (type === null || asciiLower(type) !== "hidden") break;
            this.insertVoidHtmlElement();
            return;
          }
          case T.T_FORM: {
            const inTemplate = this.parsingTemplateContents();
            if (this.formElement >= 0 && !inTemplate) return;
            const h = this.insertHtmlElement();
            if (!inTemplate) this.formElement = h;
            this.pop();
            return;
          }
        }
        break;
      case TK_END:
        switch (tok.tagId) {
          case T.T_TABLE:
            if (!this.inScope(T.T_TABLE, B_TABLE_SCOPE)) return;
            this.popUntil(T.T_TABLE);
            this.resetInsertionMode();
            return;
          case T.T_BODY:
          case T.T_CAPTION:
          case T.T_COL:
          case T.T_COLGROUP:
          case T.T_HTML:
          case T.T_TBODY:
          case T.T_TD:
          case T.T_TFOOT:
          case T.T_TH:
          case T.T_THEAD:
          case T.T_TR:
            return;
          case T.T_TEMPLATE:
            this.inHead();
            return;
        }
        break;
      case TK_EOF:
        this.inBody();
        return;
    }
    // Anything else: foster parenting.
    this.fosterParenting = true;
    this.inBody();
    this.fosterParenting = false;
  }

  /** https://html.spec.whatwg.org/#parsing-main-intabletext */
  private inTableText(): void {
    if (this.ttype === TK_CHARS) {
      let s = this.restChars();
      if (this.charsHasNull) s = removeNulls(s);
      if (s.length === 0) return;
      this.pendingTableText += s;
      if (!this.pendingTableNonWs && !isAllWs(s)) this.pendingTableNonWs = true;
      return;
    }
    const pending = this.pendingTableText;
    this.pendingTableText = "";
    if (pending.length !== 0) {
      if (this.pendingTableNonWs) {
        // Reprocess using the "anything else" entry of "in table": foster parented body text.
        const hadNull = this.charsHasNull;
        this.charsHasNull = false;
        this.fosterParenting = true;
        this.bodyChars(pending);
        this.fosterParenting = false;
        this.charsHasNull = hadNull;
      } else {
        this.insertChars(pending);
      }
    }
    this.mode = this.originalMode;
    this.reprocess = true;
  }

  /** https://html.spec.whatwg.org/#parsing-main-incaption */
  private inCaption(): void {
    const tok = this.tok;
    const type = this.ttype;
    if (type === TK_END && tok.tagId === T.T_CAPTION) {
      if (!this.inScope(T.T_CAPTION, B_TABLE_SCOPE)) return;
      this.generateImpliedEndTags(0);
      this.popUntil(T.T_CAPTION);
      this.clearToLastMarker();
      this.mode = M_IN_TABLE;
      return;
    }
    const id = tok.tagId;
    if (
      (type === TK_START &&
        (id === T.T_CAPTION || id === T.T_COL || id === T.T_COLGROUP || id === T.T_TBODY || id === T.T_TD ||
          id === T.T_TFOOT || id === T.T_TH || id === T.T_THEAD || id === T.T_TR)) ||
      (type === TK_END && id === T.T_TABLE)
    ) {
      if (!this.inScope(T.T_CAPTION, B_TABLE_SCOPE)) return;
      this.generateImpliedEndTags(0);
      this.popUntil(T.T_CAPTION);
      this.clearToLastMarker();
      this.mode = M_IN_TABLE;
      this.reprocess = true;
      return;
    }
    if (
      type === TK_END &&
      (id === T.T_BODY || id === T.T_COL || id === T.T_COLGROUP || id === T.T_HTML || id === T.T_TBODY ||
        id === T.T_TD || id === T.T_TFOOT || id === T.T_TH || id === T.T_THEAD || id === T.T_TR)
    ) {
      return;
    }
    this.inBody();
  }

  /** https://html.spec.whatwg.org/#parsing-main-incolgroup */
  private inColumnGroup(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        if (!this.insertLeadingWs()) return;
        break;
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_DOCTYPE:
        return;
      case TK_START:
        if (tok.tagId === T.T_HTML) {
          this.inBody();
          return;
        }
        if (tok.tagId === T.T_COL) {
          this.insertVoidHtmlElement();
          return;
        }
        if (tok.tagId === T.T_TEMPLATE) {
          this.inHead();
          return;
        }
        break;
      case TK_END:
        if (tok.tagId === T.T_COLGROUP) {
          if (!this.currentIs(T.T_COLGROUP)) return;
          this.pop();
          this.mode = M_IN_TABLE;
          return;
        }
        if (tok.tagId === T.T_COL) return;
        if (tok.tagId === T.T_TEMPLATE) {
          this.inHead();
          return;
        }
        break;
      case TK_EOF:
        this.inBody();
        return;
    }
    if (!this.currentIs(T.T_COLGROUP)) return;
    this.pop();
    this.mode = M_IN_TABLE;
    this.reprocess = true;
  }

  /** https://html.spec.whatwg.org/#parsing-main-intbody */
  private inTableBody(): void {
    const tok = this.tok;
    const type = this.ttype;
    const id = tok.tagId;
    if (type === TK_START) {
      if (id === T.T_TR) {
        this.clearStackBackTo(T.T_TBODY, T.T_TFOOT, T.T_THEAD);
        this.insertHtmlElement();
        this.mode = M_IN_ROW;
        return;
      }
      if (id === T.T_TH || id === T.T_TD) {
        this.clearStackBackTo(T.T_TBODY, T.T_TFOOT, T.T_THEAD);
        this.insertHtmlElementNamed("tr", T.T_TR);
        this.mode = M_IN_ROW;
        this.reprocess = true;
        return;
      }
      if (id === T.T_CAPTION || id === T.T_COL || id === T.T_COLGROUP || id === T.T_TBODY || id === T.T_TFOOT || id === T.T_THEAD) {
        if (!this.inScope(T.T_TBODY, B_TABLE_SCOPE) && !this.inScope(T.T_THEAD, B_TABLE_SCOPE) && !this.inScope(T.T_TFOOT, B_TABLE_SCOPE)) {
          return;
        }
        this.clearStackBackTo(T.T_TBODY, T.T_TFOOT, T.T_THEAD);
        this.pop();
        this.mode = M_IN_TABLE;
        this.reprocess = true;
        return;
      }
    } else if (type === TK_END) {
      if (id === T.T_TBODY || id === T.T_TFOOT || id === T.T_THEAD) {
        if (!this.inScope(id, B_TABLE_SCOPE)) return;
        this.clearStackBackTo(T.T_TBODY, T.T_TFOOT, T.T_THEAD);
        this.pop();
        this.mode = M_IN_TABLE;
        return;
      }
      if (id === T.T_TABLE) {
        if (!this.inScope(T.T_TBODY, B_TABLE_SCOPE) && !this.inScope(T.T_THEAD, B_TABLE_SCOPE) && !this.inScope(T.T_TFOOT, B_TABLE_SCOPE)) {
          return;
        }
        this.clearStackBackTo(T.T_TBODY, T.T_TFOOT, T.T_THEAD);
        this.pop();
        this.mode = M_IN_TABLE;
        this.reprocess = true;
        return;
      }
      if (id === T.T_BODY || id === T.T_CAPTION || id === T.T_COL || id === T.T_COLGROUP || id === T.T_HTML || id === T.T_TD || id === T.T_TH || id === T.T_TR) {
        return;
      }
    }
    this.inTable();
  }

  /** https://html.spec.whatwg.org/#parsing-main-intr */
  private inRow(): void {
    const tok = this.tok;
    const type = this.ttype;
    const id = tok.tagId;
    if (type === TK_START) {
      if (id === T.T_TH || id === T.T_TD) {
        this.clearStackBackTo(T.T_TR, T.T_TR, T.T_TR);
        this.insertHtmlElement();
        this.mode = M_IN_CELL;
        this.insertMarker();
        return;
      }
      if (id === T.T_CAPTION || id === T.T_COL || id === T.T_COLGROUP || id === T.T_TBODY || id === T.T_TFOOT || id === T.T_THEAD || id === T.T_TR) {
        if (!this.inScope(T.T_TR, B_TABLE_SCOPE)) return;
        this.clearStackBackTo(T.T_TR, T.T_TR, T.T_TR);
        this.pop();
        this.mode = M_IN_TABLE_BODY;
        this.reprocess = true;
        return;
      }
    } else if (type === TK_END) {
      if (id === T.T_TR) {
        if (!this.inScope(T.T_TR, B_TABLE_SCOPE)) return;
        this.clearStackBackTo(T.T_TR, T.T_TR, T.T_TR);
        this.pop();
        this.mode = M_IN_TABLE_BODY;
        return;
      }
      if (id === T.T_TABLE) {
        if (!this.inScope(T.T_TR, B_TABLE_SCOPE)) return;
        this.clearStackBackTo(T.T_TR, T.T_TR, T.T_TR);
        this.pop();
        this.mode = M_IN_TABLE_BODY;
        this.reprocess = true;
        return;
      }
      if (id === T.T_TBODY || id === T.T_TFOOT || id === T.T_THEAD) {
        if (!this.inScope(id, B_TABLE_SCOPE)) return;
        if (!this.inScope(T.T_TR, B_TABLE_SCOPE)) return;
        this.clearStackBackTo(T.T_TR, T.T_TR, T.T_TR);
        this.pop();
        this.mode = M_IN_TABLE_BODY;
        this.reprocess = true;
        return;
      }
      if (id === T.T_BODY || id === T.T_CAPTION || id === T.T_COL || id === T.T_COLGROUP || id === T.T_HTML || id === T.T_TD || id === T.T_TH) {
        return;
      }
    }
    this.inTable();
  }

  /** https://html.spec.whatwg.org/#close-the-cell */
  private closeCell(): void {
    this.generateImpliedEndTags(0);
    const stack = this.stack;
    while (stack.length !== 0) {
      const h = stack.pop() as number;
      if (this.hNs[h] === NS_HTML && (this.hTag[h] === T.T_TD || this.hTag[h] === T.T_TH)) break;
    }
    this.clearToLastMarker();
    this.mode = M_IN_ROW;
  }

  /** https://html.spec.whatwg.org/#parsing-main-intd */
  private inCell(): void {
    const tok = this.tok;
    const type = this.ttype;
    const id = tok.tagId;
    if (type === TK_END) {
      if (id === T.T_TD || id === T.T_TH) {
        if (!this.inScope(id, B_TABLE_SCOPE)) return;
        this.generateImpliedEndTags(0);
        this.popUntil(id);
        this.clearToLastMarker();
        this.mode = M_IN_ROW;
        return;
      }
      if (id === T.T_BODY || id === T.T_CAPTION || id === T.T_COL || id === T.T_COLGROUP || id === T.T_HTML) return;
      if (id === T.T_TABLE || id === T.T_TBODY || id === T.T_TFOOT || id === T.T_THEAD || id === T.T_TR) {
        if (!this.inScope(id, B_TABLE_SCOPE)) return;
        this.closeCell();
        this.reprocess = true;
        return;
      }
    } else if (type === TK_START) {
      if (
        id === T.T_CAPTION || id === T.T_COL || id === T.T_COLGROUP || id === T.T_TBODY || id === T.T_TD ||
        id === T.T_TFOOT || id === T.T_TH || id === T.T_THEAD || id === T.T_TR
      ) {
        if (!this.inScope(T.T_TD, B_TABLE_SCOPE) && !this.inScope(T.T_TH, B_TABLE_SCOPE)) return;
        this.closeCell();
        this.reprocess = true;
        return;
      }
    }
    this.inBody();
  }

  /** https://html.spec.whatwg.org/#parsing-main-intemplate */
  private inTemplate(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
      case TK_COMMENT:
      case TK_PI:
      case TK_DOCTYPE:
        this.inBody();
        return;
      case TK_START:
        switch (tok.tagId) {
          case T.T_BASE:
          case T.T_BASEFONT:
          case T.T_BGSOUND:
          case T.T_LINK:
          case T.T_META:
          case T.T_NOFRAMES:
          case T.T_SCRIPT:
          case T.T_STYLE:
          case T.T_TEMPLATE:
          case T.T_TITLE:
            this.inHead();
            return;
          case T.T_CAPTION:
          case T.T_COLGROUP:
          case T.T_TBODY:
          case T.T_TFOOT:
          case T.T_THEAD:
            this.switchTemplateMode(M_IN_TABLE);
            return;
          case T.T_COL:
            this.switchTemplateMode(M_IN_COLUMN_GROUP);
            return;
          case T.T_TR:
            this.switchTemplateMode(M_IN_TABLE_BODY);
            return;
          case T.T_TD:
          case T.T_TH:
            this.switchTemplateMode(M_IN_ROW);
            return;
        }
        this.switchTemplateMode(M_IN_BODY);
        return;
      case TK_END:
        if (tok.tagId === T.T_TEMPLATE) this.inHead();
        return;
      case TK_EOF:
        if (!this.templateInStack()) {
          this.stopped = true;
          return;
        }
        this.popUntil(T.T_TEMPLATE);
        this.clearToLastMarker();
        this.templateModes.pop();
        this.resetInsertionMode();
        this.reprocess = true;
        return;
    }
  }

  private switchTemplateMode(mode: number): void {
    this.templateModes.pop();
    this.templateModes.push(mode);
    this.mode = mode;
    this.reprocess = true;
  }

  /** https://html.spec.whatwg.org/#parsing-main-afterbody */
  private afterBody(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        if (!this.skipWsViaBody()) return;
        break;
      case TK_COMMENT:
        this.insertComment(this.stack[0]);
        return;
      case TK_PI:
        this.insertPI(this.stack[0]);
        return;
      case TK_DOCTYPE:
        return;
      case TK_START:
        if (tok.tagId === T.T_HTML) {
          this.inBody();
          return;
        }
        break;
      case TK_END:
        if (tok.tagId === T.T_HTML) {
          if (this.fragmentContext >= 0) return;
          this.mode = M_AFTER_AFTER_BODY;
          return;
        }
        break;
      case TK_EOF:
        this.stopped = true;
        return;
    }
    this.mode = M_IN_BODY;
    this.reprocess = true;
  }

  /** Whitespace is processed using the "in body" rules; returns true if non-whitespace remains. */
  private skipWsViaBody(): boolean {
    const s = this.chars;
    const start = this.cpos;
    let i = start;
    while (i < s.length && isWsCode(s.charCodeAt(i))) i++;
    if (i > start) this.bodyChars(s.slice(start, i));
    this.cpos = i;
    return i < s.length;
  }

  /** https://html.spec.whatwg.org/#parsing-main-inframeset */
  private inFrameset(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        this.insertWsOnly();
        return;
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_START:
        switch (tok.tagId) {
          case T.T_HTML:
            this.inBody();
            return;
          case T.T_FRAMESET:
            this.insertHtmlElement();
            return;
          case T.T_FRAME:
            this.insertVoidHtmlElement();
            return;
          case T.T_NOFRAMES:
            this.inHead();
            return;
        }
        return;
      case TK_END:
        if (tok.tagId === T.T_FRAMESET) {
          if (this.currentNode() === this.stack[0]) return;
          this.pop();
          if (this.fragmentContext < 0 && !this.currentIs(T.T_FRAMESET)) this.mode = M_AFTER_FRAMESET;
        }
        return;
      case TK_EOF:
        this.stopped = true;
        return;
    }
  }

  /** Insert only the whitespace characters of the token (others are parse errors, ignored). */
  private insertWsOnly(): void {
    const s = this.restChars();
    let ws = "";
    let all = true;
    for (let i = 0; i < s.length; i++) {
      if (!isWsCode(s.charCodeAt(i))) {
        all = false;
        break;
      }
    }
    if (all) ws = s;
    else {
      for (let i = 0; i < s.length; i++) if (isWsCode(s.charCodeAt(i))) ws += s[i];
    }
    this.insertChars(ws);
  }

  /** https://html.spec.whatwg.org/#parsing-main-afterframeset */
  private afterFrameset(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS:
        this.insertWsOnly();
        return;
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_START:
        if (tok.tagId === T.T_HTML) this.inBody();
        else if (tok.tagId === T.T_NOFRAMES) this.inHead();
        return;
      case TK_END:
        if (tok.tagId === T.T_HTML) this.mode = M_AFTER_AFTER_FRAMESET;
        return;
      case TK_EOF:
        this.stopped = true;
        return;
    }
  }

  /** https://html.spec.whatwg.org/#the-after-after-body-insertion-mode */
  private afterAfterBody(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_COMMENT:
        this.insertComment(this.docHandle);
        return;
      case TK_PI:
        this.insertPI(this.docHandle);
        return;
      case TK_DOCTYPE:
        this.inBody();
        return;
      case TK_CHARS:
        if (!this.skipWsViaBody()) return;
        break;
      case TK_START:
        if (tok.tagId === T.T_HTML) {
          this.inBody();
          return;
        }
        break;
      case TK_EOF:
        this.stopped = true;
        return;
    }
    this.mode = M_IN_BODY;
    this.reprocess = true;
  }

  /** https://html.spec.whatwg.org/#the-after-after-frameset-insertion-mode */
  private afterAfterFrameset(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_COMMENT:
        this.insertComment(this.docHandle);
        return;
      case TK_PI:
        this.insertPI(this.docHandle);
        return;
      case TK_DOCTYPE:
        this.inBody();
        return;
      case TK_CHARS: {
        // Whitespace: "in body" rules; anything else ignored.
        const s = this.restChars();
        let ws = "";
        for (let i = 0; i < s.length; i++) if (isWsCode(s.charCodeAt(i))) ws += s[i];
        if (ws.length !== 0) this.bodyChars(ws);
        return;
      }
      case TK_START:
        if (tok.tagId === T.T_HTML) this.inBody();
        else if (tok.tagId === T.T_NOFRAMES) this.inHead();
        return;
      case TK_EOF:
        this.stopped = true;
        return;
    }
  }

  /** https://html.spec.whatwg.org/#parsing-main-inforeign */
  private foreignContent(): void {
    const tok = this.tok;
    switch (this.ttype) {
      case TK_CHARS: {
        let s = this.restChars();
        if (this.charsHasNull) s = s.replaceAll("\0", "�");
        this.insertChars(s);
        if (this.framesetOk && hasNonWsNonNull(this.restChars())) this.framesetOk = false;
        return;
      }
      case TK_COMMENT:
        this.insertComment(-1);
        return;
      case TK_PI:
        this.insertPI(-1);
        return;
      case TK_DOCTYPE:
        return;
      case TK_START: {
        const id = tok.tagId;
        let breakout = (props[id] & B_FOREIGN_BREAKOUT) !== 0;
        if (!breakout && id === T.T_FONT) {
          breakout = this.tokenHasAttr("color") || this.tokenHasAttr("face") || this.tokenHasAttr("size");
        }
        if (breakout) {
          this.popToHtmlOrIntegrationPoint();
          this.dispatchMode(this.mode);
          return;
        }
        const acn = this.adjustedCurrentNode();
        const ns = this.hNs[acn];
        this.insertForeignElement(ns, true);
        if (tok.selfClosing) this.pop();
        return;
      }
      case TK_END: {
        const id = tok.tagId;
        if (id === T.T_BR || id === T.T_P) {
          this.popToHtmlOrIntegrationPoint();
          this.dispatchMode(this.mode);
          return;
        }
        const stack = this.stack;
        let i = stack.length - 1;
        let node = stack[i];
        if (id === T.T_SCRIPT && this.hNs[node] === NS_SVG && this.hName[node] === "script") {
          this.pop();
          return;
        }
        for (;;) {
          if (i === 0) return;
          if (asciiLower(this.hName[node]) === tok.name) {
            stack.length = i;
            return;
          }
          i--;
          node = stack[i];
          if (this.hNs[node] === NS_HTML) {
            this.dispatchMode(this.mode);
            return;
          }
        }
      }
    }
  }

  private popToHtmlOrIntegrationPoint(): void {
    const stack = this.stack;
    for (;;) {
      const h = stack[stack.length - 1];
      const t = this.hTag[h];
      if (this.hNs[h] === NS_HTML || this.hIP[h] || (t >= T.F_MI && t <= T.F_MTEXT)) return;
      stack.pop();
    }
  }
}
