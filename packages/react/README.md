# @ctrl/dom/react

Drop-in replacement for `@testing-library/react` 16.3 (`render`, `renderHook`, `act`,
`cleanup`, plus everything from `@ctrl/dom/testing-library`). Peer dependencies: `react` and
`react-dom` 19.

```tsx
import { render, screen } from "@ctrl/dom/react";
render(<button>Save</button>);
screen.getByRole("button", { name: "Save" });
```

Requires the ctrl-dom test environment (the `ctrlDom()` Vitest plugin, or `@ctrl/dom-jest-environment` with
its preset). ESM and CommonJS builds.

Part of [ctrl-dom](../../README.md). MIT licensed; third-party notices in [NOTICE](../../NOTICE).
