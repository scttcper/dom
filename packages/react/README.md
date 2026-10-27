# @ctrl/dom/react

Drop-in replacement for `@testing-library/react` 16.3 (`render`, `renderHook`, `act`,
`cleanup`, plus everything from `@ctrl/dom/testing-library`). Peer dependencies: `react` and
`react-dom` 19.

```tsx
import { render, screen } from "@ctrl/dom/react";
render(<button>Save</button>);
screen.getByRole("button", { name: "Save" });
```

Unlike stock `@testing-library/react` on React 19, a component that suspends on data (`use`,
`lazy`) during `render()` or an event shows its fallback and then its content once the data
resolves, without `await act(...)`. This relies on React internals; `configure({
releaseSuspendedWork: false })` turns it off and behaves exactly like stock.

Requires the ctrl-dom test environment (the `ctrlDom()` Vitest plugin, or `@ctrl/dom-jest-environment` with
its preset). ESM and CommonJS builds.

Part of [ctrl-dom](../../README.md). MIT licensed; third-party notices in [NOTICE](../../NOTICE).
