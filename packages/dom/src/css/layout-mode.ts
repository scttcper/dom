// Process-wide switch for layout-lite (css/layout.ts, docs/layout.md).
//
// `layoutEnabled` stays false until some window is created with `layout: "lite"`, so with the
// option off every geometry read costs one module-binding check before returning the zero it
// returned before layout-lite existed. Kept dependency-free: window/Window.ts imports it.

export type LayoutMode = "none" | "lite";

export let layoutEnabled = false;

/** Called by the Window constructor for `layout: "lite"` windows. */
export function enableLayout(): void {
  layoutEnabled = true;
}
