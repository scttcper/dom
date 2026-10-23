// The event dispatch algorithm.
// https://dom.spec.whatwg.org/#concept-event-dispatch
//
// Hot-path notes:
// - The path lives in the shared strided `PATH` stack (see Event.ts) — no struct objects.
// - The spec updates event.target/relatedTarget/touch targets at *every* struct; those values
//   are only observable from listeners and after dispatch, so `invoke` updates them only for
//   items that have listeners and the final values are applied once at the end.
// - Root tracking: computing "the root of X" for every path entry would be O(depth²). Walking
//   up through plain parent links keeps the same root, so it is recomputed only when the
//   path jumps (shadow root → host, slottable → assigned slot).
// - If the target's root is not a shadow root, it is a shadow-including inclusive ancestor of
//   every parent reached through "get the parent" (the walk never leaves its subtree before
//   reaching it, after which only a Window follows), so retargeting checks are skipped.

import {
  AT_TARGET,
  BUBBLING_PHASE,
  CAPTURING_PHASE,
  EF_BUBBLES,
  EF_CANCELED,
  EF_COMPOSED,
  EF_DISPATCH,
  EF_IN_PASSIVE_LISTENER,
  EF_MOUSE_EVENT,
  EF_STOP_IMMEDIATE,
  EF_STOP_PROPAGATION,
  EF_TOUCH_EVENT,
  EF_TRUSTED,
  NONE,
  PATH,
  PF_HAS_SHADOW_ADJUSTED_TARGET,
  PF_IN_SHADOW_TREE,
  PF_ROOT_OF_CLOSED_TREE,
  PF_SLOT_IN_CLOSED_TREE,
  STRIDE,
  pathStack,
  type Event,
  type EventState,
} from "./Event.ts";
import type { EventTarget } from "./EventTarget.ts";
import type { ActivationTarget } from "./activation.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { ELEMENT_NODE, F_HAS_SHADOW, F_SHADOW_ROOT, TEXT_NODE } from "../nodes/constants.ts";
import { reportException } from "./report.ts";
import { removeListener, type ListenerList } from "./listeners.ts";
import { $host, $impl, $listeners } from "../keys.ts";

type NodeLike = EventTarget & { [$impl]: NodeImpl };
type MaybeNode = EventTarget & { [$impl]?: NodeImpl };
type ShadowRootLike = { [$host]: EventTarget | null; mode?: string };

// --- window.event ---------------------------------------------------------------------------
// https://html.spec.whatwg.org/#current-event — one value for the (single) current window.

let currentEvent: Event | undefined = undefined;

/** https://html.spec.whatwg.org/#dom-window-event — what `window.event` returns. */
export function getCurrentEvent(): Event | undefined {
  return currentEvent;
}

// --- slots ----------------------------------------------------------------------------------

let assignedSlotLookup: ((impl: NodeImpl) => EventTarget | null) | null = null;

/**
 * Installed by the shadow DOM implementation (dom-core) once slots exist: returns the
 * assigned slot of a slottable (Element/Text), or null. Until then no node is ever assigned
 * and the lookup costs nothing.
 * https://dom.spec.whatwg.org/#slotable-assigned-slot
 */
export function setAssignedSlotLookup(fn: ((impl: NodeImpl) => EventTarget | null) | null): void {
  assignedSlotLookup = fn;
}

/** Only children of shadow hosts (F_HAS_SHADOW) can be assigned to a slot: gate the lookup on it. */
function assignedSlot(impl: NodeImpl): EventTarget | null {
  if (assignedSlotLookup === null) return null;
  const parent = impl.parent;
  if (parent === null || (parent.flags & F_HAS_SHADOW) === 0) return null;
  if (impl.type !== ELEMENT_NODE && impl.type !== TEXT_NODE) return null;
  return assignedSlotLookup(impl);
}

function isAssigned(impl: NodeImpl): boolean {
  return assignedSlot(impl) !== null;
}

function treeRoot(n: NodeImpl): NodeImpl {
  while (n.parent !== null) n = n.parent;
  return n;
}

/**
 * "Get the parent" for nodes and shadow roots.
 * https://dom.spec.whatwg.org/#get-the-parent (Node: assigned slot or parent; ShadowRoot:
 * null for non-composed events whose path starts inside it, otherwise its host).
 * `Node._getTheParent` delegates here; Document/Window override it themselves.
 */
export function nodeGetTheParent(node: NodeLike, event: Event): EventTarget | null {
  const impl = node[$impl];
  const parent = impl.parent;
  if (parent !== null && (parent.flags & F_HAS_SHADOW) !== 0) {
    const slot = assignedSlot(impl);
    if (slot !== null) return slot;
  }
  if ((impl.flags & F_SHADOW_ROOT) !== 0) {
    const s = event._s;
    if ((s.flags & EF_COMPOSED) === 0 && s.pathLength > 0) {
      const first = (PATH[s.pathStart] as MaybeNode)[$impl];
      if (first !== undefined && treeRoot(first) === impl) return null;
    }
    return (node as unknown as ShadowRootLike)[$host];
  }
  return parent === null ? null : parent.node;
}

/** https://dom.spec.whatwg.org/#concept-shadow-including-inclusive-ancestor */
function isShadowIncludingInclusiveAncestor(a: NodeImpl, b: NodeImpl): boolean {
  let cur: NodeImpl | null = b;
  while (cur !== null) {
    if (cur === a) return true;
    if (cur.parent !== null) cur = cur.parent;
    else if ((cur.flags & F_SHADOW_ROOT) !== 0) {
      const host = (cur.node as unknown as ShadowRootLike)[$host] as MaybeNode | null;
      cur = host === null || host[$impl] === undefined ? null : host[$impl];
    } else cur = null;
  }
  return false;
}

/** Whether retargeting `a` can ever change it (it is a node in a shadow tree). */
function inShadowTree(a: EventTarget | null): boolean {
  if (a === null) return false;
  const impl = (a as MaybeNode)[$impl];
  return impl !== undefined && (treeRoot(impl).flags & F_SHADOW_ROOT) !== 0;
}

/** https://dom.spec.whatwg.org/#retarget */
export function retarget(a: EventTarget | null, b: EventTarget): EventTarget | null {
  for (;;) {
    if (a === null) return null;
    const ai = (a as MaybeNode)[$impl];
    if (ai === undefined) return a;
    const root = treeRoot(ai);
    if ((root.flags & F_SHADOW_ROOT) === 0) return a;
    const bi = (b as MaybeNode)[$impl];
    if (bi !== undefined && isShadowIncludingInclusiveAncestor(root, bi)) return a;
    a = (root.node as unknown as ShadowRootLike)[$host];
  }
}

function retargetList(list: EventTarget[] | null, b: EventTarget): EventTarget[] | null {
  if (list === null) return null;
  const out: EventTarget[] = [];
  for (let i = 0; i < list.length; i++) out.push(retarget(list[i], b)!);
  return out;
}

function hasActivationBehavior(t: EventTarget): boolean {
  return (t as ActivationTarget)._hasActivationBehavior === true;
}

/** https://dom.spec.whatwg.org/#concept-event-path-append */
function appendToEventPath(
  item: EventTarget,
  shadowAdjustedTarget: EventTarget | null,
  relatedTarget: EventTarget | null,
  touchTargets: EventTarget[] | null,
  slotInClosedTree: boolean,
  root: NodeImpl | null,
): void {
  const o = pathStack.top;
  let f = 0;
  if (root !== null && (root.flags & F_SHADOW_ROOT) !== 0) {
    f |= PF_IN_SHADOW_TREE;
    const impl = (item as MaybeNode)[$impl];
    if (impl === root && (item as unknown as ShadowRootLike).mode === "closed") f |= PF_ROOT_OF_CLOSED_TREE;
  }
  if (slotInClosedTree) f |= PF_SLOT_IN_CLOSED_TREE;
  PATH[o] = item;
  if (shadowAdjustedTarget !== null) {
    f |= PF_HAS_SHADOW_ADJUSTED_TARGET;
    PATH[o + 1] = shadowAdjustedTarget;
  } else {
    PATH[o + 1] = PATH[o + 1 - STRIDE];
  }
  PATH[o + 2] = relatedTarget;
  PATH[o + 3] = touchTargets;
  PATH[o + 4] = f;
  pathStack.top = o + STRIDE;
}

/**
 * https://dom.spec.whatwg.org/#concept-event-dispatch
 * Returns false if the event was canceled. Callers set isTrusted beforehand
 * (`dispatchEvent` clears it; user-agent dispatches use `fireAnEvent` / `setTrusted`).
 */
export function dispatch(event: Event, target: EventTarget, legacyTargetOverride = false): boolean {
  const s = event._s;
  // Step 1.
  s.flags |= EF_DISPATCH;
  // Step 2.
  const targetOverride = legacyTargetOverride ? ((target as unknown as { document: EventTarget }).document ?? target) : target;
  // Step 3.
  let activationTarget: EventTarget | null = null;
  // Step 4.
  const eventRelatedTarget = s.relatedTarget;
  const relatedSlow = inShadowTree(eventRelatedTarget);
  let relatedTarget = relatedSlow ? retarget(eventRelatedTarget, target) : eventRelatedTarget;
  // Step 5.
  let clearTargets = false;
  const base = pathStack.top;
  try {
    // Step 6.
    if (target !== relatedTarget || target === eventRelatedTarget) {
      const touchList = (s.flags & EF_TOUCH_EVENT) !== 0 ? (event as unknown as { _touchTargetList(): EventTarget[] })._touchTargetList() : null;
      s.pathStart = base;
      s.pathLength = 0;
      const targetImpl = (target as MaybeNode)[$impl];
      let curRoot: NodeImpl | null = targetImpl === undefined ? null : treeRoot(targetImpl);
      let targetRoot = curRoot;
      let targetRootIsShadow = targetRoot !== null && (targetRoot.flags & F_SHADOW_ROOT) !== 0;
      // Step 6.3.
      appendToEventPath(target, targetOverride, relatedTarget, retargetList(touchList, target), false, curRoot);
      s.pathLength = 1;
      // Offset of the last struct with a shadow-adjusted target (clearTargetsStruct, step 6.10).
      let lastShadowAdjusted = base;
      // Steps 6.4-6.5.
      const isActivationEvent = (s.flags & EF_MOUSE_EVENT) !== 0 && s.type === "click";
      const bubbles = (s.flags & EF_BUBBLES) !== 0;
      if (isActivationEvent && hasActivationBehavior(target)) activationTarget = target;
      // Steps 6.6-6.8.
      let slottable = targetImpl !== undefined && isAssigned(targetImpl);
      let slotInClosedTree = false;
      let prevImpl: NodeImpl | undefined = targetImpl;
      let parent = target._getTheParent(event);
      // Step 6.9.
      while (parent !== null) {
        const pi = (parent as MaybeNode)[$impl];
        let parentRoot: NodeImpl | null;
        if (pi === undefined) parentRoot = null;
        else if (prevImpl !== undefined && prevImpl.parent === pi) parentRoot = curRoot;
        else parentRoot = treeRoot(pi);
        // 6.9.1.
        if (slottable) {
          slottable = false;
          if (parentRoot !== null && (parentRoot.flags & F_SHADOW_ROOT) !== 0 && (parentRoot.node as unknown as ShadowRootLike).mode === "closed") {
            slotInClosedTree = true;
          }
        }
        // 6.9.2.
        if (pi !== undefined && isAssigned(pi)) slottable = true;
        // 6.9.3-6.9.4.
        relatedTarget = relatedSlow ? retarget(eventRelatedTarget, parent) : eventRelatedTarget;
        const touchTargets = retargetList(touchList, parent);
        // 6.9.5.
        if (pi === undefined || (targetRoot !== null && (!targetRootIsShadow || isShadowIncludingInclusiveAncestor(targetRoot, pi)))) {
          if (isActivationEvent && bubbles && activationTarget === null && hasActivationBehavior(parent)) activationTarget = parent;
          appendToEventPath(parent, null, relatedTarget, touchTargets, slotInClosedTree, parentRoot);
          s.pathLength++;
        } else if (parent === relatedTarget) {
          // 6.9.6.
          parent = null;
        } else {
          // 6.9.7.
          target = parent;
          targetRoot = parentRoot;
          targetRootIsShadow = targetRoot !== null && (targetRoot.flags & F_SHADOW_ROOT) !== 0;
          if (isActivationEvent && activationTarget === null && hasActivationBehavior(target)) activationTarget = target;
          lastShadowAdjusted = pathStack.top;
          appendToEventPath(parent, target, relatedTarget, touchTargets, slotInClosedTree, parentRoot);
          s.pathLength++;
        }
        // 6.9.8-6.9.9.
        if (parent !== null) {
          prevImpl = pi;
          curRoot = parentRoot;
          parent = parent._getTheParent(event);
        }
        slotInClosedTree = false;
      }
      const end = pathStack.top;
      // Steps 6.10-6.11.
      {
        const o = lastShadowAdjusted;
        if (inShadowTree(PATH[o + 1] as EventTarget) || inShadowTree(PATH[o + 2] as EventTarget | null)) clearTargets = true;
        else {
          const touches = PATH[o + 3] as EventTarget[] | null;
          if (touches !== null) for (let i = 0; i < touches.length; i++) if (inShadowTree(touches[i])) clearTargets = true;
        }
      }
      // Step 6.12.
      if (activationTarget !== null) (activationTarget as ActivationTarget)._legacyPreActivationBehavior?.();
      // Step 6.13: capturing.
      for (let o = end - STRIDE; o >= base; o -= STRIDE) {
        s.eventPhase = ((PATH[o + 4] as number) & PF_HAS_SHADOW_ADJUSTED_TARGET) !== 0 ? AT_TARGET : CAPTURING_PHASE;
        invoke(event, s, o, CAPTURING_PHASE);
      }
      // Step 6.14: bubbling.
      let last = base;
      for (let o = base; o < end; o += STRIDE) {
        if (((PATH[o + 4] as number) & PF_HAS_SHADOW_ADJUSTED_TARGET) !== 0) s.eventPhase = AT_TARGET;
        else {
          if (!bubbles) continue;
          s.eventPhase = BUBBLING_PHASE;
        }
        last = o;
        invoke(event, s, o, BUBBLING_PHASE);
      }
      // The last invoke's target updates (applied lazily, see the header comment).
      s.target = PATH[last + 1] as EventTarget;
      s.relatedTarget = PATH[last + 2] as EventTarget | null;
      s.touchTargets = PATH[last + 3] as EventTarget[] | null;
    }
  } finally {
    // Pop this dispatch's structs (and drop the references they hold).
    for (let o = base, end = pathStack.top; o < end; o++) PATH[o] = null;
    pathStack.top = base;
    // Steps 7-10.
    s.eventPhase = NONE;
    s.currentTarget = null;
    s.pathStart = -1;
    s.pathLength = 0;
    s.flags &= ~(EF_DISPATCH | EF_STOP_PROPAGATION | EF_STOP_IMMEDIATE | EF_IN_PASSIVE_LISTENER);
  }
  // Step 11.
  if (clearTargets) {
    s.target = null;
    s.relatedTarget = null;
    s.touchTargets = null;
  }
  // Step 12.
  if (activationTarget !== null) {
    const at = activationTarget as ActivationTarget;
    if ((s.flags & EF_CANCELED) === 0) at._activationBehavior?.(event);
    else at._legacyCanceledActivationBehavior?.();
  }
  // Step 13.
  return (s.flags & EF_CANCELED) === 0;
}

// https://dom.spec.whatwg.org/#concept-event-listener-invoke step 8 (legacy pre-fixed types).
function legacyType(type: string): string | null {
  switch (type) {
    case "animationend":
      return "webkitAnimationEnd";
    case "animationiteration":
      return "webkitAnimationIteration";
    case "animationstart":
      return "webkitAnimationStart";
    case "transitionend":
      return "webkitTransitionEnd";
    default:
      return null;
  }
}

/** https://dom.spec.whatwg.org/#concept-event-listener-invoke */
function invoke(event: Event, s: EventState, o: number, phase: number): void {
  const item = PATH[o] as EventTarget;
  const map = item[$listeners];
  if (map === null) return;
  // Steps 1-3.
  s.target = PATH[o + 1] as EventTarget;
  s.relatedTarget = PATH[o + 2] as EventTarget | null;
  s.touchTargets = PATH[o + 3] as EventTarget[] | null;
  // Step 4.
  if ((s.flags & EF_STOP_PROPAGATION) !== 0) return;
  // Step 5.
  s.currentTarget = item;
  const inShadow = ((PATH[o + 4] as number) & PF_IN_SHADOW_TREE) !== 0;
  // Steps 6-7.
  const type = s.type;
  const list = map.get(type);
  const found = list !== undefined && innerInvoke(event, s, item, type, list, phase, inShadow);
  // Step 8.
  if (!found && (s.flags & EF_TRUSTED) !== 0) {
    const legacy = legacyType(type);
    if (legacy === null) return;
    const legacyList = map.get(legacy);
    if (legacyList === undefined) return;
    s.type = legacy;
    try {
      innerInvoke(event, s, item, legacy, legacyList, phase, inShadow);
    } finally {
      s.type = type;
    }
  }
}

/** https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke */
function innerInvoke(event: Event, s: EventState, currentTarget: EventTarget, type: string, list: ListenerList, phase: number, inShadow: boolean): boolean {
  let found = false;
  // The snapshot: mutations while iterating copy-on-write (see listeners.ts).
  const items = list.items;
  list.iterating++;
  try {
    for (let i = 0; i < items.length; i++) {
      const listener = items[i];
      // Step 2.1-2.3.
      if (listener.removed) continue;
      found = true;
      // Step 2.4.
      if (phase === CAPTURING_PHASE ? !listener.capture : listener.capture) continue;
      // Step 2.5.
      if (listener.once) removeListener(currentTarget, type, listener);
      // Steps 2.6-2.8: window.event.
      const previousEvent = currentEvent;
      if (!inShadow) currentEvent = event;
      // Step 2.9.
      if (listener.passive) s.flags |= EF_IN_PASSIVE_LISTENER;
      // Step 2.10.
      const callback = listener.callback;
      try {
        if (typeof callback === "function") callback.call(currentTarget, event);
        else {
          const handleEvent = callback.handleEvent;
          if (typeof handleEvent !== "function") throw new TypeError("The provided callback is not a function and has no callable 'handleEvent' property.");
          handleEvent.call(callback, event);
        }
      } catch (error) {
        reportException(error, currentTarget);
      }
      // Steps 2.11-2.12.
      s.flags &= ~EF_IN_PASSIVE_LISTENER;
      currentEvent = previousEvent;
      // Step 2.13.
      if ((s.flags & EF_STOP_IMMEDIATE) !== 0) break;
    }
  } finally {
    list.iterating--;
  }
  return found;
}
