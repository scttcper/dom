// (e) type-level checks (never executed): our declarations are real types, not `any`.
import { render, renderHook, screen, type RenderResult } from "@rtd/react";
import userEvent, { type UserEvent } from "@rtd/user-event";
import "@rtd/jest-dom/vitest";
import { expect, expectTypeOf } from "vitest";
import { createWindow, type Window } from "@rtd/dom";

const result = render(null);
expectTypeOf(result).toExtend<RenderResult>();
expectTypeOf(result.rerender).parameter(0).not.toBeAny();
expectTypeOf(renderHook(() => 1).result.current).toEqualTypeOf<number>();
expectTypeOf(userEvent.setup()).toEqualTypeOf<UserEvent>();
expectTypeOf(createWindow).returns.toEqualTypeOf<Window>();
expectTypeOf(screen.getByRole).returns.toEqualTypeOf<HTMLElement>();

expect(screen.getByRole("button")).toBeInTheDocument();
expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
// @ts-expect-error -- matcher augmentation is typed, unknown matchers are errors
expect(screen.getByRole("button")).toBeInTheDocumentt();
// @ts-expect-error -- render takes a ReactNode
render(Symbol("not a node"), { container: 1 });
// @ts-expect-error -- user-event options are typed
userEvent.setup({ delay: "fast" });
