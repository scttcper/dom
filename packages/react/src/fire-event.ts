// Port of @testing-library/react@16.3.3 src/fire-event.js
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/fire-event.js
//
// react-testing-library's version of fireEvent calls dom-testing-library's version. The
// distinction exists because a few events work differently with React's event system.
// Every call goes through DTL's `eventWrapper`, which pure.ts configures to run in act().

import { fireEvent as dtlFireEvent, type FireFunction, type FireObject } from "./dtl.ts";

type AnyFire = (...args: any[]) => boolean;

const fireEvent = ((...args: Parameters<FireFunction>) => dtlFireEvent(...args)) as FireFunction & FireObject;
const fe = fireEvent as unknown as Record<string, AnyFire>;
const dtl = dtlFireEvent as unknown as Record<string, AnyFire>;

for (const key of Object.keys(dtlFireEvent)) {
  fe[key] = (...args) => dtl[key](...args);
}

// React event system tracks native mouseOver/mouseOut events for running
// onMouseEnter/onMouseLeave handlers
// https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/react-dom/src/events/EnterLeaveEventPlugin.js#L24-L31
const mouseEnter = fe.mouseEnter;
const mouseLeave = fe.mouseLeave;
fe.mouseEnter = (...args) => {
  mouseEnter(...args);
  return fe.mouseOver(...args);
};
fe.mouseLeave = (...args) => {
  mouseLeave(...args);
  return fe.mouseOut(...args);
};

const pointerEnter = fe.pointerEnter;
const pointerLeave = fe.pointerLeave;
fe.pointerEnter = (...args) => {
  pointerEnter(...args);
  return fe.pointerOver(...args);
};
fe.pointerLeave = (...args) => {
  pointerLeave(...args);
  return fe.pointerOut(...args);
};

const select = fe.select;
fe.select = (node, init) => {
  select(node, init);
  // React tracks this event only on focused inputs
  node.focus();
  // React creates this event when one of the following native events happens
  // - contextMenu
  // - mouseUp
  // - dragEnd
  // - keyUp
  // - keyDown
  // so we can use any here
  // https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/react-dom/src/events/SelectEventPlugin.js#L203-L224
  // Upstream returns undefined here (no `return`); kept for parity.
  fe.keyUp(node, init);
  return undefined as unknown as boolean;
};

// React event system tracks native focusout/focusin events for running blur/focus handlers
// https://github.com/facebook/react/pull/19186
const blur = fe.blur;
const focus = fe.focus;
fe.blur = (...args) => {
  fe.focusOut(...args);
  return blur(...args);
};
fe.focus = (...args) => {
  fe.focusIn(...args);
  return focus(...args);
};

export { fireEvent };
