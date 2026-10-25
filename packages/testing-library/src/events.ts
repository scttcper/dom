// Port of @testing-library/dom src/events.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/events.js

import { getConfig } from "./config.ts";
import { getWindowFromNode } from "./helpers.ts";
import { eventMap, eventAliasMap } from "./event-map.ts";
import { describeNode, traceSync, tracing } from "@ctrl/dom/internal";

function fireEvent_(element: any, event: any): boolean {
  // Ours: a span per event when something subscribes to @ctrl/dom's tracing channel.
  if (tracing() && event && element) {
    return traceSync("testing-library.fire_event", `fireEvent.${event.type}(${describeNode(element)})`, () =>
      fireEventUntraced(element, event),
    );
  }
  return fireEventUntraced(element, event);
}

function fireEventUntraced(element: any, event: any): boolean {
  return getConfig().eventWrapper(() => {
    if (!event) {
      throw new Error(`Unable to fire an event - please provide an event object.`);
    }
    if (!element) {
      throw new Error(`Unable to fire a "${event.type}" event - please provide a DOM element.`);
    }
    return element.dispatchEvent(event);
  }) as unknown as boolean;
}

function createEvent_(
  eventName: string,
  node: any,
  init?: any,
  { EventType = "Event", defaultInit = {} }: { EventType?: string; defaultInit?: any } = {},
): any {
  if (!node) {
    throw new Error(`Unable to fire a "${eventName}" event - please provide a DOM element.`);
  }
  const eventInit = { ...defaultInit, ...init };
  const { target: { value, files, ...targetProperties } = {} as any } = eventInit;
  if (value !== undefined) {
    setNativeValue(node, value);
  }
  if (files !== undefined) {
    // input.files is a read-only property so this is not allowed:
    // input.files = [file]
    // so we have to use this workaround to set the property
    Object.defineProperty(node, "files", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: files,
    });
  }
  Object.assign(node, targetProperties);
  const window = getWindowFromNode(node);
  const EventConstructor = window[EventType] || window.Event;
  let event: any;
  if (typeof EventConstructor === "function") {
    event = new EventConstructor(eventName, eventInit);
  } else {
    // IE11 polyfill from https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent#Polyfill
    event = window.document.createEvent(EventType);
    const { bubbles, cancelable, detail, ...otherInit } = eventInit;
    event.initEvent(eventName, bubbles, cancelable, detail);
    Object.keys(otherInit).forEach((eventKey) => {
      event[eventKey] = otherInit[eventKey];
    });
  }

  // DataTransfer is not supported in jsdom: https://github.com/jsdom/jsdom/issues/1568
  const dataTransferProperties = ["dataTransfer", "clipboardData"];
  dataTransferProperties.forEach((dataTransferKey) => {
    const dataTransferValue = eventInit[dataTransferKey];
    if (typeof dataTransferValue === "object") {
      if (typeof window.DataTransfer === "function") {
        Object.defineProperty(event, dataTransferKey, {
          value: Object.getOwnPropertyNames(dataTransferValue).reduce((acc, propName) => {
            Object.defineProperty(acc, propName, { value: dataTransferValue[propName] });
            return acc;
          }, new window.DataTransfer()),
        });
      } else {
        Object.defineProperty(event, dataTransferKey, {
          value: dataTransferValue,
        });
      }
    }
  });

  return event;
}

// function written after some investigation here:
// https://github.com/facebook/react/issues/10135#issuecomment-401496776
function setNativeValue(element: any, value: unknown): void {
  const { set: valueSetter } = Object.getOwnPropertyDescriptor(element, "value") || {};
  const prototype = Object.getPrototypeOf(element);
  const { set: prototypeValueSetter } = Object.getOwnPropertyDescriptor(prototype, "value") || {};
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else {
    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      throw new Error("The given element does not have a value setter");
    }
  }
}

type FireFunction = (element: any, event: any) => boolean;
type FireObject = Record<string, (element: any, options?: {}) => boolean>;
type CreateFunction = (
  eventName: string,
  node: any,
  init?: {},
  options?: { EventType?: string; defaultInit?: {} },
) => any;
type CreateObject = Record<string, (element: any, options?: {}) => any>;

// Keep upstream's function names (`fireEvent.name === "fireEvent"`).
Object.defineProperty(fireEvent_, "name", { value: "fireEvent" });
Object.defineProperty(createEvent_, "name", { value: "createEvent" });
export const fireEvent = fireEvent_ as FireFunction & FireObject;
export const createEvent = createEvent_ as CreateFunction & CreateObject;

Object.keys(eventMap).forEach((key) => {
  const { EventType, defaultInit } = eventMap[key];
  const eventName = key.toLowerCase();

  createEvent[key] = (node, init) => createEvent(eventName, node, init, { EventType, defaultInit });
  fireEvent[key] = (node, init) => fireEvent(node, createEvent[key](node, init));
});

Object.keys(eventAliasMap).forEach((aliasKey) => {
  const key = eventAliasMap[aliasKey];
  fireEvent[aliasKey] = (...args: [any, any?]) => fireEvent[key](...args);
});
