import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Ported upstream suites call `jest.fn()` / `jest.spyOn()`.
(globalThis as any).jest = vi;
