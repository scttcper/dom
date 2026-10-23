# @rtd/user-event

Drop-in replacement for `@testing-library/user-event` 14.6, with fast paths for `@rtd/dom`.

```ts
import userEvent from "@rtd/user-event";
const user = userEvent.setup();
await user.type(screen.getByRole("textbox"), "hello");
```

ESM and CommonJS builds.

Part of [react-testing-dom](../../README.md). Third-party notices: `dist/NOTICE`.
