// Internal API for sibling packages (@rtd/aria, @rtd/testing-library, @rtd/user-event,
// @rtd/jest-dom, vitest-environment-rtd). Not for end users: no stability guarantees.
//
// Everything here works on NodeImpl (see nodes/NodeImpl.ts). Prefer these over the public DOM
// API in hot paths: they are monomorphic and allocation-free.

import "./index.ts";

export * from "./nodes/constants.ts";
export { NodeImpl, AttrRecord } from "./nodes/NodeImpl.ts";
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
export { captureInterfaceBaseline, restoreInterfaces } from "./window/isolation.ts";

// --- events area ---
export { dispatch, getCurrentEvent, retarget, nodeGetTheParent, setAssignedSlotLookup } from "./events/dispatch.ts";
export { fireAnEvent, dispatchTrusted, fireSyntheticPointerEvent } from "./events/fire.ts";
export { setTrusted, EventState } from "./events/Event.ts";
export { reportException, setUncaughtExceptionHandler, type UncaughtExceptionHandler } from "./events/report.ts";
export { createEvent } from "./events/createEvent.ts";
export { installEventHandlers, getEventHandler, setEventHandler, GLOBAL_EVENT_HANDLER_EVENTS, WINDOW_EVENT_HANDLER_EVENTS, type EventHandlersKind } from "./events/handlers.ts";
export { hasListeners, removeAllEventListeners } from "./events/listeners.ts";
export type { ActivationTarget } from "./events/activation.ts";

// --- dom-core ---
export { NodeList } from "./collections/NodeList.ts";
export { HTMLCollection, withNamedProperties, ensureCollectionIndexGetters, type ElementFilter } from "./collections/HTMLCollection.ts";
export { indexGetterTable, ensureIndexGetters, type IndexGetterTable } from "./collections/indexed.ts";
export { notifyMutationObservers, activeObservers } from "./observers/queue.ts";
export { compareBoundaryPoints, nodeLength } from "./traversal/Range.ts";
export { findSlot, assignedNodes, assignedElements, assignManually, findFlattenedSlottables, assignedSlot } from "./nodes/slots.ts";
export { attachShadowRoot, getElementsByTagName, getElementsByTagNameNS, getElementsByClassName } from "./nodes/Element.ts";
export { attrNode } from "./nodes/attr-nodes.ts";
export { replaceData, splitText } from "./nodes/character-data.ts";
export { inspectNode } from "./nodes/inspect.ts";
export { validateAndExtract, isValidElementLocalName, isValidNamespacePrefix, isValidDoctypeName } from "./nodes/names.ts";

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
export * from "./keys.ts";
