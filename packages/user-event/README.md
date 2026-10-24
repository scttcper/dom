# @ctrl/dom/user-event

Drop-in replacement for `@testing-library/user-event` 14.6, with fast paths for `@ctrl/dom`.

```ts
import userEvent from "@ctrl/dom/user-event";
const user = userEvent.setup();
await user.type(screen.getByRole("textbox"), "hello");
```

ESM and CommonJS builds.

Part of [ctrl-dom](../../README.md). MIT licensed; third-party notices in [NOTICE](../../NOTICE).
