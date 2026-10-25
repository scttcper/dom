// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/events.js
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";
import { render, fireEvent } from "@ctrl/dom/react";

// No lib.dom in this repo: environment globals are untyped here.
declare const document: any;
declare const window: any;
declare const Event: any;

const eventTypes: Array<{ type: string; events: string[]; elementType: string; init?: object }> = [
  { type: "Clipboard", events: ["copy", "paste"], elementType: "input" },
  { type: "Composition", events: ["compositionEnd", "compositionStart", "compositionUpdate"], elementType: "input" },
  { type: "Keyboard", events: ["keyDown", "keyPress", "keyUp"], elementType: "input", init: { keyCode: 13 } },
  { type: "Focus", events: ["focus", "blur"], elementType: "input" },
  { type: "Form", events: ["focus", "blur"], elementType: "input" },
  { type: "Focus", events: ["input", "invalid"], elementType: "input" },
  { type: "Focus", events: ["submit"], elementType: "form" },
  {
    type: "Mouse",
    events: [
      "click", "contextMenu", "doubleClick", "drag", "dragEnd", "dragEnter", "dragExit", "dragLeave", "dragOver",
      "dragStart", "drop", "mouseDown", "mouseEnter", "mouseLeave", "mouseMove", "mouseOut", "mouseOver", "mouseUp",
    ],
    elementType: "button",
  },
  {
    type: "Pointer",
    events: [
      "pointerOver", "pointerEnter", "pointerDown", "pointerMove", "pointerUp", "pointerCancel", "pointerOut",
      "pointerLeave", "gotPointerCapture", "lostPointerCapture",
    ],
    elementType: "button",
  },
  { type: "Selection", events: ["select"], elementType: "input" },
  { type: "Touch", events: ["touchCancel", "touchEnd", "touchMove", "touchStart"], elementType: "button" },
  { type: "UI", events: ["scroll"], elementType: "div" },
  { type: "Wheel", events: ["wheel"], elementType: "div" },
  {
    type: "Media",
    events: [
      "abort", "canPlay", "canPlayThrough", "durationChange", "emptied", "encrypted", "ended", "error", "loadedData",
      "loadedMetadata", "loadStart", "pause", "play", "playing", "progress", "rateChange", "seeked", "seeking",
      "stalled", "suspend", "timeUpdate", "volumeChange", "waiting",
    ],
    elementType: "video",
  },
  { type: "Image", events: ["load", "error"], elementType: "img" },
  { type: "Animation", events: ["animationStart", "animationEnd", "animationIteration"], elementType: "div" },
  { type: "Transition", events: ["transitionEnd"], elementType: "div" },
];

const fe = fireEvent as unknown as Record<string, (node: unknown, init?: object) => unknown>;

eventTypes.forEach(({ type, events, elementType, init }) => {
  describe(`${type} Events`, () => {
    events.forEach((eventName) => {
      const propName = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;

      // Not upstream: React DOM listens for vendor-prefixed animation events when the window
      // has no `AnimationEvent` (jsdom 30), so the stock-jsdom oracle cannot pass these.
      const itOrSkip = type === "Animation" && !("AnimationEvent" in window) ? it.skip : it;
      itOrSkip(`triggers ${propName}`, () => {
        const ref = React.createRef<any>();
        const spy = vi.fn();

        render(
          React.createElement(elementType, {
            [propName]: spy,
            ref,
          }),
        );

        fe[eventName](ref.current, init);
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });
  });
});

eventTypes.forEach(({ type, events, elementType, init }) => {
  describe(`Native ${type} Events`, () => {
    events.forEach((eventName) => {
      let nativeEventName = eventName.toLowerCase();

      // The doubleClick synthetic event maps to the dblclick native event
      if (nativeEventName === "doubleclick") {
        nativeEventName = "dblclick";
      }

      it(`triggers native ${nativeEventName}`, () => {
        const ref = React.createRef<any>();
        const spy = vi.fn();
        const Element = elementType as any;

        const NativeEventElement = () => {
          React.useEffect(() => {
            const element = ref.current;
            element.addEventListener(nativeEventName, spy);
            return () => {
              element.removeEventListener(nativeEventName, spy);
            };
          });
          return <Element ref={ref} />;
        };

        render(<NativeEventElement />);

        fe[eventName](ref.current, init);
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });
  });
});

test("onChange works", () => {
  const handleChange = vi.fn();
  const {
    container: { firstChild: input },
  } = render(<input onChange={handleChange} />);
  fireEvent.change(input, { target: { value: "a" } });
  expect(handleChange).toHaveBeenCalledTimes(1);
});

test("calling `fireEvent` directly works too", () => {
  const handleEvent = vi.fn();
  const {
    container: { firstChild: button },
  } = render(<button onClick={handleEvent} />);
  fireEvent(
    button,
    new Event("MouseEvent", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
});

test("blur/focus bubbles in react", () => {
  const handleBlur = vi.fn();
  const handleBubbledBlur = vi.fn();
  const handleFocus = vi.fn();
  const handleBubbledFocus = vi.fn();
  const { container } = render(
    <div onBlur={handleBubbledBlur} onFocus={handleBubbledFocus}>
      <button onBlur={handleBlur} onFocus={handleFocus} />
    </div>,
  );
  const button = container.firstChild.firstChild;

  fireEvent.focus(button);

  expect(handleBlur).toHaveBeenCalledTimes(0);
  expect(handleBubbledBlur).toHaveBeenCalledTimes(0);
  expect(handleFocus).toHaveBeenCalledTimes(1);
  expect(handleBubbledFocus).toHaveBeenCalledTimes(1);

  fireEvent.blur(button);

  expect(handleBlur).toHaveBeenCalledTimes(1);
  expect(handleBubbledBlur).toHaveBeenCalledTimes(1);
  expect(handleFocus).toHaveBeenCalledTimes(1);
  expect(handleBubbledFocus).toHaveBeenCalledTimes(1);
});
