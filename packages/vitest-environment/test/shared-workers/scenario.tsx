// What each fixture file checks at its start, and the mess it leaves for the next one.
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { expect, test } from "vitest";
import { load } from "./counter.ts";

const shared = globalThis as unknown as { firedAfterFile?: string[]; unmounted?: string[]; files?: number };

function Leftover({ name }: { name: string }) {
  useEffect(() => () => void (shared.unmounted ??= []).push(name), [name]);
  return (
    <>
      <style precedence="low" href={`sheet-${name}`}>{`.x{color:red}`}</style>
      <button type="button">from {name}</button>
    </>
  );
}

export function scenario(name: string): void {
  const position = (shared.files = (shared.files ?? 0) + 1);

  test(`${name}: starts from a reset window and fresh first-party modules`, () => {
    expect(load()).toBe(1);
    expect(document.body.childNodes.length).toBe(0);
    expect(document.body.getAttributeNames()).toEqual([]);
    expect(document.documentElement.getAttributeNames()).toEqual([]);
    expect(document.head.querySelectorAll("style").length).toBe(0);
    expect(document.activeElement).toBe(document.body);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
    expect(location.href).toBe("http://localhost:3000/");
    expect(history.length).toBe(1);
    // The files before this one left trees mounted, and timers pending that must never fire.
    expect(shared.unmounted ?? []).toHaveLength(position - 1);
    expect(shared.firedAfterFile ?? []).toEqual([]);
  });

  test(`${name}: with globals, Testing Library's cleanup runs after each test of every file`, () => {
    render(<p>first</p>);
    expect(screen.getByText("first")).toBeDefined();
  });

  test(`${name}: the previous test's tree is gone when the runner has globals`, () => {
    expect(screen.queryByText("first") === null).toBe(process.env.FIXTURE_GLOBALS === "1");
  });

  test(`${name}: leaves a mess`, async () => {
    render(<Leftover name={name} />);
    screen.getByRole("button").focus();
    document.body.setAttribute("data-theme", "dark");
    document.documentElement.setAttribute("lang", "fr");
    localStorage.setItem("k", name);
    sessionStorage.setItem("k", name);
    document.cookie = `seen=${name}`;
    history.pushState({ name }, "", `/visited/${name}?q=1#h`);
    setTimeout(() => (shared.firedAfterFile ??= []).push(name), 5);
    requestAnimationFrame(() => (shared.firedAfterFile ??= []).push(`${name} frame`));
    expect(document.head.querySelectorAll("style").length).toBe(1);
  });
}
