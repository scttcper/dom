// (e) the Vitest plugin's types (never executed).
import { defineConfig } from "vitest/config";
import { ctrlDom, type CtrlDomPluginOptions } from "@ctrl/dom/vitest";

const options: CtrlDomPluginOptions = { url: "http://localhost/", width: 1280, timeSkip: false, matchMedia: true };
export default defineConfig({ plugins: [ctrlDom(options), ctrlDom({ testingLibrary: false })] });
// @ts-expect-error -- plugin options are typed
ctrlDom({ testingLibrary: "yes" });
