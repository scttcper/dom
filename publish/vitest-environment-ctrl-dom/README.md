# vitest-environment-ctrl-dom

Lets Vitest find [@ctrl/dom](https://www.npmjs.com/package/@ctrl/dom)'s environment by name:
`environment: "ctrl-dom"` and `// @vitest-environment ctrl-dom`. The environment itself ships in
@ctrl/dom.

```sh
pnpm add -D @ctrl/dom vitest-environment-ctrl-dom
```

```ts
// vitest.config.ts
export default defineConfig({ test: { environment: "ctrl-dom" } });
```

For the whole stack (your `@testing-library/*` imports routed to @ctrl/dom), use the plugin
instead, which needs only @ctrl/dom: `plugins: [ctrlDom()]` from `@ctrl/dom/vitest`.

## License

MIT. Third-party notices are in the package's `NOTICE` file.
