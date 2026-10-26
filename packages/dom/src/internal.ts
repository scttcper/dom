// Internal API for sibling packages (@ctrl/dom/aria, @ctrl/dom/testing-library, @ctrl/dom/user-event,
// @ctrl/dom/jest-dom, @ctrl/dom/vitest-environment). Not for end users: no stability guarantees.
//
// Everything here works on NodeImpl (see nodes/NodeImpl.ts). Prefer these over the public DOM
// API in hot paths: they are monomorphic and allocation-free.

import "./index.ts";

export * from "./nodes/constants.ts";
export { NodeImpl, AttrRecord } from "./nodes/NodeImpl.ts";
import type { NodeImpl as NodeImplType } from "./nodes/NodeImpl.ts";
export { NodeCache, nodeCache } from "./nodes/cache.ts";
export { derivedCache, peekDerivedCache } from "./nodes/derived.ts";
export { T, tagId, tagName } from "./nodes/tags.ts";
export {
  nextInTree,
  nextSkippingChildren,
  previousInTree,
  nextElementInTree,
  firstElementChild,
  lastElementChild,
  nextElementSibling,
  previousElementSibling,
  treeRoot,
  isInclusiveAncestor,
  indexOf,
  childAt,
} from "./nodes/traverse.ts";
export {
  attr,
  hasAttr,
  getAttribute,
  setAttribute,
  removeAttribute,
  classTokens,
  asciiLowercase,
  splitOnAsciiWhitespace,
  isAsciiWhitespace,
} from "./nodes/attributes.ts";
export { matches, closest, querySelector, querySelectorAll } from "./selectors/index.ts";
export { serializeChildren, serializeNode } from "./serializer/index.ts";
export { parseFragment } from "./parser/index.ts";

// --- window area ---
export { windowHooks, type WindowHooks, type MediaFeatureEnvironment } from "./window/hooks.ts";
export { createFileList } from "./window/FileList.ts";
export { evaluateMediaQueryList, mediaEnvironment } from "./window/media.ts";
export { windowInterfaces } from "./window/Window.ts";
export { captureInterfaceBaseline, guardInterfaceDefinitions, restoreInterfaces } from "./window/isolation.ts";
export {
  COMPAT,
  COMPAT_PROFILES,
  DEFAULT_COMPAT,
  compatExposes,
  deferredCompatMembers,
  hiddenGlobals,
  resolveCompat,
  type CompatEntry,
  type CompatProfile,
} from "./window/compat.ts";
export { trackGlobalTimers } from "./window/timers.ts";
export {
  VirtualClock,
  VirtualTimeout,
  installClock,
  clockNow,
  clockStats,
  foreignImmediatesPending,
  skipIdleTime,
  virtualDate,
  virtualPerformance,
  type InstalledClock,
  type VirtualClockOptions,
} from "./window/clock.ts";
export {
  FAILURE_CHANNEL,
  SPAN_CHANNEL,
  describeCall,
  describeNode,
  quote,
  setFailureSnapshot,
  setNodeDescriber,
  spanChannel,
  subscribeTestFailures,
  tracePromise,
  traceSync,
  tracing,
  type SpanContext,
} from "./trace.ts";

// --- events area ---
export { dispatch, getCurrentEvent, retarget, nodeGetTheParent, setAssignedSlotLookup } from "./events/dispatch.ts";
export { fireAnEvent, dispatchTrusted, fireSyntheticPointerEvent } from "./events/fire.ts";
export { setTrusted, EventState } from "./events/Event.ts";
export { reportException, setUncaughtExceptionHandler, type UncaughtExceptionHandler } from "./events/report.ts";
export {
  setNotImplementedHandler,
  type NotImplementedError,
  type NotImplementedHandler,
} from "./window/not-implemented.ts";
export { createEvent } from "./events/createEvent.ts";
export {
  installEventHandlers,
  getEventHandler,
  setEventHandler,
  GLOBAL_EVENT_HANDLER_EVENTS,
  WINDOW_EVENT_HANDLER_EVENTS,
  type EventHandlersKind,
} from "./events/handlers.ts";
export { hasListeners, removeAllEventListeners } from "./events/listeners.ts";
export type { ActivationTarget } from "./events/activation.ts";

// --- dom-core ---
export { NodeList } from "./collections/NodeList.ts";
export {
  HTMLCollection,
  withNamedProperties,
  ensureCollectionIndexGetters,
  type ElementFilter,
} from "./collections/HTMLCollection.ts";
export { indexGetterTable, ensureIndexGetters, type IndexGetterTable } from "./collections/indexed.ts";
export { notifyMutationObservers, activeObservers } from "./observers/queue.ts";
export { compareBoundaryPoints, nodeLength } from "./traversal/Range.ts";
export {
  findSlot,
  assignedNodes,
  assignedElements,
  assignManually,
  findFlattenedSlottables,
  assignedSlot,
} from "./nodes/slots.ts";
export {
  attachShadowRoot,
  getElementsByTagName,
  getElementsByTagNameNS,
  getElementsByClassName,
} from "./nodes/Element.ts";
export { attrNode } from "./nodes/attr-nodes.ts";
export { replaceData, splitText } from "./nodes/character-data.ts";
export { inspectNode } from "./nodes/inspect.ts";
export {
  validateAndExtract,
  isValidElementLocalName,
  isValidNamespacePrefix,
  isValidDoctypeName,
} from "./nodes/names.ts";

// --- forms area (html/forms) ---
export {
  inputType,
  inputTypeFromAttr,
  INPUT_TYPE_NAMES,
  valueMode,
  supportsSelectionType,
  isTextualType,
  isNumericType,
} from "./html/forms/input-type.ts";
export {
  isDisabled,
  isEnabled,
  isMutable,
  isReadOnly,
  isReadWrite,
  hasReadonlyAttribute,
  isRequired,
  isOptional,
  isValid,
  isInvalid,
  isInRange,
  isOutOfRange,
  isChecked,
  isIndeterminate,
  isDefault,
  isPlaceholderShown,
  isAutofilled,
  isTextControl,
  controlValue,
  inputChecked,
  inputIndeterminate,
  optionSelected,
} from "./html/forms/state.ts";
export {
  formOwner,
  labeledControl,
  labelsFor,
  isLabelable,
  isListed,
  isSubmittable,
  isResettable,
  isActuallyDisabled,
} from "./html/forms/form-associated.ts";
export { listOfOptions } from "./html/forms/collections.ts";
export { implicitSubmission, constructEntryList, defaultButton, isSubmitButton } from "./html/forms/form-submission.ts";
export {
  isEditable as isEditableControl,
  supportsSelection,
  hasUIValue,
  getUIValue,
  setUIValue,
  clearUIValue,
  getUISelection,
  setUISelection,
  setFilesFromUI,
  setOptionSelectedFromUI,
  setCheckedFromUI,
  type UISelection,
} from "./html/forms/ui.ts";

// --- css area (fast style queries; see src/css/internal.ts) ---
export * from "./css/internal.ts";
export { isFACE, faceState } from "./html/forms/face.ts";

// --- html-dom area (ARIA element reflection: explicitly set aria-labelledby/... references) ---
export { attrAssociatedElement, attrAssociatedElements, hasExplicitAttrElements } from "./html/aria-reflection.ts";
export * from "./keys.ts";

// --- user-replaced window.getComputedStyle ---
//
// Stock Testing Library, dom-accessibility-api, user-event and jest-dom read styles through
// `element.ownerDocument.defaultView.getComputedStyle`, so test setups that replace it (Sentry:
// `window.getComputedStyle = el => el.style`, to skip jsdom's cascade) change what they see.
// Our upper layers read the cascade directly (css/internal.ts, aria's caches); they call this
// once per query/call and, when it returns a function, read styles through it exactly where
// the stock package calls getComputedStyle. Returns null while the window's own implementation
// is in place (the fast path stays at one property read + identity check).

import { Window } from "./window/Window.ts";
import { installedWindowMethods } from "./window/host-originals.ts";
import type { Element } from "./nodes/Element.ts";
import type { CSSStyleDeclaration } from "./css/CSSStyleDeclaration.ts";

/** A user-installed `getComputedStyle`, bound to its window (called like `window.getComputedStyle(el)`). */
export type ComputedStyleOverride = (element: Element, pseudoElement?: string) => CSSStyleDeclaration;

const OWN_GET_COMPUTED_STYLE: unknown = Window.prototype.getComputedStyle;

// One-entry memo: (view, function) -> bound override. All weak: the function closes over its test
// file's realm and the bound copy over the window, so a strong reference would keep a finished
// file's realm alive in a reused worker until another file replaced getComputedStyle.
let memoView: WeakRef<object> | null = null;
let memoFn: WeakRef<object> | null = null;
let memoResult: WeakRef<ComputedStyleOverride> | null = null;

/**
 * The user-replaced `getComputedStyle` of `node`'s window (`ownerDocument.defaultView`), bound
 * to that window, or null when it is @ctrl/dom's own (the prototype method, or the bound copy
 * installGlobals put on a host global) or there is no window / no function.
 */
export function getComputedStyleOverride(node: NodeImplType): ComputedStyleOverride | null {
  const view = (node.doc as unknown as { defaultView: Record<string, unknown> | null }).defaultView;
  if (view === null || view === undefined) return null;
  const fn = view.getComputedStyle;
  if (fn === OWN_GET_COMPUTED_STYLE || typeof fn !== "function" || installedWindowMethods.has(fn)) return null;
  if (memoFn?.deref() === fn && memoView?.deref() === view) {
    const memo = memoResult!.deref();
    if (memo !== undefined) return memo;
  }
  const result = (fn as (...args: unknown[]) => unknown).bind(view) as ComputedStyleOverride;
  memoView = new WeakRef(view);
  memoFn = new WeakRef(fn);
  memoResult = new WeakRef(result);
  return result;
}
