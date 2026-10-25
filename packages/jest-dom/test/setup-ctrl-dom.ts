import { vi } from "vitest";
import "@ctrl/dom/jest-dom/vitest";

// Ported upstream suites call `jest.fn()` / `jest.spyOn()`.
(globalThis as any).jest = vi;
