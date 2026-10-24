// (e) type-level checks (never executed): our declarations are real types, not `any`.
import { render, renderHook, screen, type RenderResult } from "@ctrl/dom/react";
import userEvent, { type UserEvent } from "@ctrl/dom/user-event";
import "@ctrl/dom/jest-dom/vitest";
import { expect, expectTypeOf } from "vitest";
import { createWindow, type Window } from "@ctrl/dom";

const result = render(null);
expectTypeOf(result).toExtend<RenderResult>();
expectTypeOf(result.rerender).parameter(0).not.toBeAny();
expectTypeOf(renderHook(() => 1).result.current).toEqualTypeOf<number>();
expectTypeOf(userEvent.setup()).toEqualTypeOf<UserEvent>();
expectTypeOf(createWindow).returns.toEqualTypeOf<Window>();
expectTypeOf(screen.getByRole).returns.toEqualTypeOf<HTMLElement>();

expect(screen.getByRole("button")).toBeInTheDocument();
expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
// Matchers return Vitest's R: void, and a promise after .resolves.
expectTypeOf(expect(screen.getByRole("button")).toBeVisible()).toEqualTypeOf<void>();
expectTypeOf(expect(Promise.resolve(screen.getByRole("button"))).resolves.toBeVisible()).toEqualTypeOf<Promise<void>>();
// @ts-expect-error -- matcher augmentation is typed, unknown matchers are errors
expect(screen.getByRole("button")).toBeInTheDocumentt();
// @ctrl/dom's addition: aria snapshot templates.
expectTypeOf(expect(document.body).toMatchAriaSnapshot(`- button "Go"`)).toEqualTypeOf<void>();
// @ts-expect-error -- the template is a string
expect(document.body).toMatchAriaSnapshot({ role: "button" });
// @ts-expect-error -- render takes a ReactNode
render(Symbol("not a node"), { container: 1 });
// @ts-expect-error -- user-event options are typed
userEvent.setup({ delay: "fast" });
