// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/event-wrapper-nesting.js
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";
import { render, fireEvent, getConfig } from "@ctrl/dom/react";

// No lib.dom in this repo: environment globals are untyped here.
declare const document: any;
declare const window: any;
declare const Event: any;

const { useState, useEffect, useRef } = React;

const dispatchDOMEvent = (target: any, type: string) =>
  getConfig().eventWrapper(() => target.dispatchEvent(new Event(type, { bubbles: true })));

test("does not warn about act when there are nested acts", () => {
  function Fixture() {
    const [open, setOpen] = useState(false);
    const [fromEffect, setFromEffect] = useState(0);
    const [fromEvent, setFromEvent] = useState(0);
    const targetRef = useRef(null);

    useEffect(() => {
      if (!open) {
        return;
      }
      dispatchDOMEvent(targetRef.current, "input");
      setFromEffect((n) => n + 1);
    }, [open]);

    return (
      <>
        <button onClick={() => setOpen(true)}>{`open:${open} effect:${fromEffect} event:${fromEvent}`}</button>
        <input ref={targetRef} readOnly onInput={() => setFromEvent((n) => n + 1)} />
      </>
    );
  }

  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = render(<Fixture />);
  const button = container.querySelector("button");

  fireEvent.click(button);

  expect(button).toHaveTextContent("open:true effect:1 event:1");
  const actWarnings = errorSpy.mock.calls
    .map((args) => String(args[0]))
    .filter((message) => message.includes("not wrapped in act"));
  expect(actWarnings).toEqual([]);

  errorSpy.mockRestore();
});
