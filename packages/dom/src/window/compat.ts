// Compat profiles: which APIs an installed window exposes beyond what jsdom has.
//
// Test suites written for jsdom feature-detect: a library that finds `PointerEvent`, `matchMedia`
// or `ResizeObserver` takes its browser path, which may need layout or animation we do not have,
// and a suite that polyfills a missing API (`window.matchMedia ??= mock`) keeps ours instead.
// So the environments install a profile:
//
//   jsdom-26  what jest-environment-jsdom 30 exposes (it ships jsdom 26.1): the Jest default
//   jsdom-30  what jsdom 30 exposes (Vitest's jsdom environment): the Vitest and createWindow default
//   modern    everything @ctrl/dom implements
//
// COMPAT lists every API we expose that jsdom 30 or jsdom 26 lacks, with the profiles that get it
// and why. tests/compat/test/surface/ diffs each jsdom profile's installed surface against the
// real jsdom version, so exposing a new API fails until it is listed here: a new entry is a
// decision about which profiles get it. docs/deviations.md groups the differences by profile.
//
// A profile applies where a window is installed as the global (installGlobals: the environments),
// since interface objects and prototypes are shared by every window in the process
// (docs/deviations.md). Globals are left out of the installation; interface members are added to
// or removed from their shared prototype for the installation's lifetime (installCompatMembers),
// and environments that capture an interface baseline (window/isolation.ts) do so before
// installing, so restoreInterfaces() also puts members back between test files. Members are
// defined at module load when jsdom-30 exposes them (the common default needs no prototype
// changes); members only `modern` exposes are moved aside at load (deferCompatMember).

export type CompatProfile = "jsdom-26" | "jsdom-30" | "modern";

export const COMPAT_PROFILES: readonly CompatProfile[] = ["jsdom-26", "jsdom-30", "modern"];

export const DEFAULT_COMPAT: CompatProfile = "jsdom-30";

export interface CompatEntry {
  /** Window globals: interface objects and window members. */
  readonly globals?: readonly string[];
  /** Interface members, "Interface.member" (own property of `Interface.prototype`) or "Interface.static.member". */
  readonly members?: readonly string[];
  /** The profiles that expose the entry. */
  readonly profiles: readonly CompatProfile[];
  readonly reason: string;
}

const ALL = COMPAT_PROFILES;
const JSDOM_30_UP: readonly CompatProfile[] = ["jsdom-30", "modern"];
const MODERN: readonly CompatProfile[] = ["modern"];

const handlers = (events: readonly string[]) => events.map((e) => `on${e}`);
const on = (iface: string, names: readonly string[]) => names.map((n) => `${iface}.${n}`);
// oxfmt-ignore
const POINTER_HANDLERS = handlers([
  "gotpointercapture", "lostpointercapture", "pointercancel", "pointerdown", "pointerenter", "pointerleave",
  "pointermove", "pointerout", "pointerover", "pointerrawupdate", "pointerup",
]);
// oxfmt-ignore
const NEWER_HANDLERS = handlers([
  "animationcancel", "animationend", "animationiteration", "animationstart", "command", "selectionchange",
  "selectstart", "transitioncancel", "transitionend", "transitionrun", "transitionstart",
]);
const HANDLER_OWNERS = ["Document", "HTMLElement", "SVGElement", "MathMLElement"];

// oxfmt-ignore
export const COMPAT: readonly CompatEntry[] = [
  // ── Hidden from jsdom profiles: libraries feature-detect these ────────────────────────────────
  {
    globals: ["PointerEvent", ...POINTER_HANDLERS],
    members: HANDLER_OWNERS.flatMap((iface) => on(iface, POINTER_HANDLERS)),
    profiles: JSDOM_30_UP,
    reason:
      "jsdom 27 added pointer events. Libraries pick pointer or mouse/touch code paths by detecting `PointerEvent` or `onpointerdown` (React Aria caches the choice at import), so suites written for jsdom 26 break when they exist, and again when they `delete global.PointerEvent` after installing a fake.",
  },
  {
    globals: ["matchMedia", "MediaQueryList", "MediaQueryListEvent"],
    profiles: MODERN,
    reason:
      "No jsdom has matchMedia. Suites install their own (mock-match-media only polyfills it when it is missing: React Aria's `setMedia({pointer: 'coarse'})` did nothing with ours present) and components feature-detect it.",
  },
  {
    globals: ["ResizeObserver"],
    profiles: MODERN,
    reason:
      "No jsdom has ResizeObserver, and libraries detect it to pick their browser path: Base UI's ScrollArea then calls getAnimations(), which nothing implements. Suites written for jsdom install their own (Sentry's MockResizeObserver).",
  },
  {
    members: ["HTMLElement.inert"],
    profiles: MODERN,
    reason:
      "No jsdom has the `inert` IDL attribute. Libraries that find it mark content outside a modal `inert` instead of `aria-hidden` (React Aria's ariaHideOutside, Radix's hideOthers), which stock Testing Library's queries do not treat as inaccessible. The content attribute makes subtrees inert in every profile.",
  },
  {
    globals: ["visualViewport"],
    profiles: MODERN,
    reason:
      "Without layout its numbers mislead positioning libraries (Floating UI), which fall back to the document element when it is absent, as under jsdom. `createWindow({ visualViewport })` overrides the profile.",
  },

  // ── jsdom 27–30 additions, kept in jsdom-26 ───────────────────────────────────────────────────
  {
    globals: [
      "CSS", "CSSConditionRule", "CSSContainerRule", "CSSFontFaceRule", "CSSGroupingRule", "CSSKeyframeRule",
      "CSSKeyframesRule", "CSSLayerBlockRule", "CSSLayerStatementRule", "CSSNamespaceRule", "CSSNestedDeclarations",
      "CSSPageRule", "CSSRuleList", "CSSScopeRule", "CSSSupportsRule",
    ],
    members: ["HTMLStyleElement.disabled"],
    profiles: ALL,
    reason:
      "CSSOM classes are only reached through style sheets jsdom 26 also parses (its rule objects come from the cssom package). `CSS.escape`/`CSS.supports` behave as the polyfills suites install, which replace ours by assignment.",
  },
  {
    globals: ["BeforeUnloadEvent", "PromiseRejectionEvent", "TransitionEvent"],
    members: ["MouseEvent.movementX", "MouseEvent.movementY", "CustomElementRegistry.getName"],
    profiles: ALL,
    reason: "Event classes and members nothing feature-detects; our own dispatch creates these events.",
  },

  // ── Beyond jsdom, kept in every profile ───────────────────────────────────────────────────────
  {
    globals: [
      "AnimationEvent", "ClipboardEvent", "CommandEvent", "DragEvent", "FormDataEvent", "TextEvent", "ToggleEvent",
      "Touch", "TouchList", ...NEWER_HANDLERS, "onpagereveal", "onpageswap",
    ],
    members: [
      ...["Document", "HTMLElement", "SVGElement"].flatMap((iface) => on(iface, NEWER_HANDLERS)),
      ...on("HTMLBodyElement", ["onpagereveal", "onpageswap"]),
      ...on("HTMLFrameSetElement", ["onpagereveal", "onpageswap"]),
      "TouchEvent.getModifierState",
      "PopStateEvent.hasUAVisualTransition",
      "InputEvent.dataTransfer",
    ],
    profiles: ALL,
    reason:
      "Event classes and handler attributes for events our dispatch fires (popover toggle, command, form data, drag, clipboard, animation/transition). Libraries construct or listen for them; none switch code paths on their presence.",
  },
  {
    globals: ["Clipboard", "ClipboardItem", "DataTransfer", "DataTransferItem", "DataTransferItemList"],
    members: ["Navigator.clipboard"],
    profiles: ALL,
    reason:
      "user-event's `setup()` replaces `navigator.clipboard` with its stub either way, and builds DataTransfer objects for drag/paste whether or not the DOM has the class.",
  },
  {
    globals: ["IntersectionObserver"],
    profiles: ALL,
    reason:
      "Component libraries construct it unconditionally and crash when it is missing; ours never reports entries (no layout), and suites that need entries install a mock by assignment.",
  },
  {
    globals: [
      "SVGAElement", "SVGCircleElement", "SVGClipPathElement", "SVGEllipseElement", "SVGFilterElement",
      "SVGForeignObjectElement", "SVGGeometryElement", "SVGGradientElement", "SVGImageElement", "SVGLineElement",
      "SVGLinearGradientElement", "SVGMarkerElement", "SVGMaskElement", "SVGPathElement", "SVGPatternElement",
      "SVGPolygonElement", "SVGPolylineElement", "SVGRadialGradientElement", "SVGRectElement", "SVGScriptElement",
      "SVGStopElement", "SVGStyleElement", "SVGTSpanElement", "SVGTextContentElement", "SVGTextElement",
      "SVGTextPathElement", "SVGTextPositioningElement", "SVGUseElement", "SVGViewElement", "MathMLElement",
    ],
    members: [
      "SVGElement.autofocus",
      ...on("SVGGraphicsElement", ["getBBox", "getCTM", "getScreenCTM"]),
      ...on("SVGSVGElement", [
        "animationsPaused", "checkEnclosure", "checkIntersection", "createSVGAngle", "createSVGLength",
        "createSVGMatrix", "createSVGPoint", "createSVGTransform", "deselectAll", "getCurrentTime",
        "getEnclosureList", "getIntersectionList", "pauseAnimations", "setCurrentTime", "unpauseAnimations",
      ]),
    ],
    profiles: ALL,
    reason:
      "Element classes for markup jsdom creates as plain SVGElement/Element (instanceof checks only), and SVG geometry that returns zeros without layout; suites that need numbers assign their own getBBox.",
  },
  {
    globals: ["DOMMatrix", "DOMMatrixReadOnly", "DOMPoint", "DOMPointReadOnly", "DOMRectList"],
    members: ["Range.getBoundingClientRect", "Range.getClientRects"],
    profiles: ALL,
    reason:
      "Geometry values (zeros without layout). Editors call `range.getBoundingClientRect()`, which jsdom lacks; suites mock it by assignment.",
  },
  {
    globals: [
      "CSSPropertyRule", "CSSStartingStyleRule", "CustomStateSet", "DOMStringList", "MediaError", "TimeRanges",
      "VisualViewport",
    ],
    members: [
      ...on("CSSRule", ["DOCUMENT_RULE", "REGION_STYLE_RULE", "VIEWPORT_RULE"]),
      ...on("CSSRule.static", ["DOCUMENT_RULE", "REGION_STYLE_RULE", "VIEWPORT_RULE"]),
      "CSSStyleDeclaration.cssFloat",
      ...on("ElementInternals", [
        "ariaActiveDescendantElement", "ariaBrailleLabel", "ariaBrailleRoleDescription", "ariaControlsElements",
        "ariaDescribedByElements", "ariaDetailsElements", "ariaErrorMessageElements", "ariaFlowToElements",
        "ariaLabelledByElements", "ariaOwnsElements", "checkValidity", "form", "reportValidity", "setFormValue",
        "setValidity", "states", "validationMessage", "validity", "willValidate",
      ]),
    ],
    profiles: ALL,
    reason: "Interfaces reached only through objects that create them (style sheets, form-associated custom elements, media elements).",
  },
  {
    globals: ["cancelIdleCallback", "requestIdleCallback", "clientInformation", "closed", "crossOriginIsolated", "isSecureContext", "opener", "reportError"],
    members: [
      "History.scrollRestoration",
      ...on("Screen", ["availLeft", "availTop", "isExtended"]),
      ...on("Navigator", [
        "deviceMemory", "doNotTrack", "maxTouchPoints", "oscpu", "pdfViewerEnabled", "registerProtocolHandler",
        "sendBeacon", "unregisterProtocolHandler", "userActivation", "vibrate", "webdriver",
      ]),
    ],
    profiles: ALL,
    reason:
      "Window and navigator members with browser defaults (no touch points, not a webdriver). Fake timers fake requestIdleCallback like the other timer functions; libraries that fall back to setTimeout without it behave the same.",
  },
  {
    members: [
      ...on("Document", [
        "adoptedStyleSheets", "alinkColor", "bgColor", "designMode", "domain", "fgColor", "linkColor", "moveBefore",
        "scrollingElement", "vlinkColor",
      ]),
      "Document.static.parseHTMLUnsafe",
      "DocumentFragment.moveBefore",
      ...on("Element", [
        "ariaActiveDescendantElement", "ariaBrailleLabel", "ariaBrailleRoleDescription", "ariaControlsElements",
        "ariaDescribedByElements", "ariaDetailsElements", "ariaErrorMessageElements", "ariaFlowToElements",
        "ariaLabelledByElements", "ariaOwnsElements", "checkVisibility", "dataset", "getHTML", "moveBefore", "part",
        "scroll", "scrollBy", "scrollIntoView", "scrollTo", "setHTMLUnsafe",
      ]),
      ...on("ShadowRoot", [
        "adoptedStyleSheets", "clonable", "delegatesFocus", "elementFromPoint", "elementsFromPoint", "getHTML",
        "serializable", "setHTMLUnsafe", "slotAssignment", "styleSheets",
      ]),
      ...on("Selection", ["direction", "getComposedRanges", "modify"]),
    ],
    profiles: ALL,
    reason:
      "DOM members suites written for jsdom stub by assignment when they need them (`Element.prototype.scrollIntoView = vi.fn()`), which replaces ours. `Element.dataset` is on Element (jsdom: on HTMLElement and SVGElement).",
  },
  {
    members: [
      ...on("HTMLElement", [
        "accessKeyLabel", "autocapitalize", "autocorrect", "autofocus", "contentEditable", "enterKeyHint", "hidePopover",
        "innerText", "inputMode", "isContentEditable", "outerText", "popover", "showPopover", "spellcheck",
        "togglePopover", "writingSuggestions",
      ]),
      ...on("HTMLButtonElement", ["command", "commandForElement", "formAction", "formEnctype", "formMethod", "popoverTargetAction", "popoverTargetElement"]),
      ...on("HTMLInputElement", ["formAction", "formEnctype", "formMethod", "height", "popoverTargetAction", "popoverTargetElement", "showPicker", "width"]),
      ...on("HTMLDialogElement", ["close", "closedBy", "requestClose", "returnValue", "show", "showModal"]),
      ...on("HTMLAnchorElement", ["ping", "referrerPolicy"]),
      ...on("HTMLAreaElement", ["download", "hreflang", "ping", "referrerPolicy", "type"]),
      ...on("HTMLCanvasElement", ["captureStream", "transferControlToOffscreen"]),
      "HTMLDetailsElement.name",
      "HTMLEmbedElement.getSVGDocument",
      ...on("HTMLFormElement", ["autocomplete", "encoding", "rel", "relList"]),
      ...on("HTMLIFrameElement", ["allow", "loading", "referrerPolicy", "sandbox"]),
      ...on("HTMLImageElement", ["decode", "decoding", "fetchPriority", "loading", "referrerPolicy", "x", "y"]),
      ...on("HTMLLinkElement", ["as", "blocking", "disabled", "fetchPriority", "imageSizes", "imageSrcset", "integrity", "referrerPolicy", "sizes"]),
      ...on("HTMLMarqueeElement", ["loop", "start", "stop"]),
      ...on("HTMLMediaElement", [
        "disableRemotePlayback", "error", "fastSeek", "getStartDate", "loading", "mediaKeys", "preservesPitch",
        "setMediaKeys", "setSinkId", "sinkId", "srcObject",
      ]),
      "HTMLMetaElement.media",
      ...on("HTMLObjectElement", ["contentWindow", "getSVGDocument"]),
      ...on("HTMLScriptElement", ["async", "blocking", "fetchPriority", "integrity", "noModule", "referrerPolicy"]),
      "HTMLScriptElement.static.supports",
      ...on("HTMLSelectElement", ["autocomplete", "showPicker"]),
      "HTMLSlotElement.assign",
      ...on("HTMLSourceElement", ["height", "width"]),
      "HTMLStyleElement.blocking",
      ...on("HTMLTemplateElement", ["shadowRootClonable", "shadowRootDelegatesFocus", "shadowRootMode", "shadowRootSerializable", "shadowRootSlotAssignment"]),
      "HTMLTrackElement.track",
      ...on("HTMLVideoElement", ["cancelVideoFrameCallback", "disablePictureInPicture", "getVideoPlaybackQuality", "requestPictureInPicture", "requestVideoFrameCallback"]),
    ],
    profiles: ALL,
    reason:
      "Reflected attributes and element behavior we implement (popover, dialog, invoker commands, innerText). Where jsdom lacks a method, suites assign their own (`HTMLDialogElement.prototype.showModal = vi.fn()`), which replaces ours.",
  },
];

/** `value` as a profile, or a TypeError naming the valid ones. */
export function resolveCompat(value: unknown): CompatProfile {
  if (value === undefined) return DEFAULT_COMPAT;
  if (COMPAT_PROFILES.includes(value as CompatProfile)) return value as CompatProfile;
  throw new TypeError(
    `Unknown compat profile ${JSON.stringify(value)}: expected ${COMPAT_PROFILES.map((p) => JSON.stringify(p)).join(", ")}.`,
  );
}

const hiddenGlobalsCache = new Map<CompatProfile, ReadonlySet<string>>();

/** Window globals the profile leaves out of an installation. */
export function hiddenGlobals(profile: CompatProfile): ReadonlySet<string> {
  let set = hiddenGlobalsCache.get(profile);
  if (set === undefined) {
    const names = new Set<string>();
    for (const entry of COMPAT) {
      if (entry.globals === undefined || entry.profiles.includes(profile)) continue;
      for (const name of entry.globals) names.add(name);
    }
    hiddenGlobalsCache.set(profile, (set = names));
  }
  return set;
}

/** Whether the profile exposes `name` (a global or "Interface.member" listed in COMPAT); unlisted names are exposed everywhere. */
export function compatExposes(profile: CompatProfile, name: string): boolean {
  for (const entry of COMPAT) {
    if (entry.globals?.includes(name) || entry.members?.includes(name)) return entry.profiles.includes(profile);
  }
  return true;
}

/** Members moved aside at load because jsdom-30 does not expose them: "Interface.member" → owner + descriptor. */
const deferred = new Map<string, { owner: object; descriptor: PropertyDescriptor }>();

/**
 * Take `name` off `owner` (an interface prototype) at module load and keep it for profiles that
 * expose it. Owners call it right after their class definition, before any instance exists.
 */
export function deferCompatMember(owner: object, iface: string, name: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(owner, name);
  if (descriptor === undefined) throw new Error(`deferCompatMember: ${iface}.${name} is not defined`);
  delete (owner as Record<string, unknown>)[name];
  deferred.set(`${iface}.${name}`, { owner, descriptor });
}

/** Members a profile took off their prototype (descriptor kept for a later profile that exposes them). */
const removed = new Map<string, PropertyDescriptor>();

/** @internal For the surface test: members held back at load. */
export function deferredCompatMembers(): ReadonlyMap<string, { owner: object; descriptor: PropertyDescriptor }> {
  return deferred;
}

type GatedMember = {
  key: string;
  iface: string;
  member: string;
  isStatic: boolean;
  profiles: readonly CompatProfile[];
};
let gated: GatedMember[] | null = null;

/** Members whose exposure differs between profiles (the rest are exposed everywhere and never touched). */
function gatedMembers(): GatedMember[] {
  if (gated !== null) return gated;
  gated = [];
  for (const entry of COMPAT) {
    if (entry.members === undefined || entry.profiles.length === COMPAT_PROFILES.length) continue;
    for (const key of entry.members) {
      const parts = key.split(".");
      const isStatic = parts.length === 3 && parts[1] === "static";
      gated.push({ key, iface: parts[0], member: parts[parts.length - 1], isStatic, profiles: entry.profiles });
    }
  }
  return gated;
}

/**
 * Add or remove gated interface members on their shared prototypes for `profile`; returns the
 * function that undoes it. `interfaces` maps interface names to interface objects. Removed
 * members are remembered, so a later profile can add them back even if nothing restored them in
 * between (the Jest environment's baseline keeps the first file's profile).
 */
export function installCompatMembers(profile: CompatProfile, interfaces: Record<string, unknown>): () => void {
  const undo: Array<() => void> = [];
  for (const g of gatedMembers()) {
    const iface = interfaces[g.iface] as { prototype?: object } | undefined;
    if (iface === undefined) continue;
    const owner = g.isStatic ? (iface as object) : iface.prototype;
    if (owner === undefined) continue;
    const want = g.profiles.includes(profile);
    const has = Object.hasOwn(owner, g.member);
    if (want && !has) {
      const descriptor = deferred.get(g.key)?.descriptor ?? removed.get(g.key);
      if (descriptor === undefined) continue;
      Object.defineProperty(owner, g.member, descriptor);
      undo.push(() => delete (owner as Record<string, unknown>)[g.member]);
    } else if (!want && has) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, g.member)!;
      removed.set(g.key, descriptor);
      delete (owner as Record<string, unknown>)[g.member];
      undo.push(() => Object.defineProperty(owner, g.member, descriptor));
    }
  }
  return () => {
    for (let i = undo.length - 1; i >= 0; i--) undo[i]();
  };
}
