// Copied from pretty-format@27.5.1 build/types.d.ts and build/index.d.ts (MIT, Copyright (c) Facebook,
// Inc. and its affiliates): the types upstream's `prettyFormat` re-export and `PrettyDOMOptions`
// expose, here so the published declarations don't need pretty-format installed (it is an optional
// peer of @ctrl/dom).
// https://github.com/jestjs/jest/blob/v27.5.1/packages/pretty-format/src/types.ts

export declare type Colors = {
    comment: {
        close: string;
        open: string;
    };
    content: {
        close: string;
        open: string;
    };
    prop: {
        close: string;
        open: string;
    };
    tag: {
        close: string;
        open: string;
    };
    value: {
        close: string;
        open: string;
    };
};
declare type Indent = (arg0: string) => string;
export declare type Refs = Array<unknown>;
declare type Print = (arg0: unknown) => string;
export declare type Theme = {
    comment: string;
    content: string;
    prop: string;
    tag: string;
    value: string;
};
declare type ThemeReceived = {
    comment?: string;
    content?: string;
    prop?: string;
    tag?: string;
    value?: string;
};
export declare type CompareKeys = ((a: string, b: string) => number) | undefined;
export declare type Options = {
    callToJSON: boolean;
    compareKeys: CompareKeys;
    escapeRegex: boolean;
    escapeString: boolean;
    highlight: boolean;
    indent: number;
    maxDepth: number;
    min: boolean;
    plugins: Plugins;
    printBasicPrototype: boolean;
    printFunctionName: boolean;
    theme: Theme;
};
export interface PrettyFormatOptions {
    callToJSON?: boolean;
    compareKeys?: CompareKeys;
    escapeRegex?: boolean;
    escapeString?: boolean;
    highlight?: boolean;
    indent?: number;
    maxDepth?: number;
    min?: boolean;
    plugins?: Plugins;
    printBasicPrototype?: boolean;
    printFunctionName?: boolean;
    theme?: ThemeReceived;
}
export declare type OptionsReceived = PrettyFormatOptions;
export declare type Config = {
    callToJSON: boolean;
    compareKeys: CompareKeys;
    colors: Colors;
    escapeRegex: boolean;
    escapeString: boolean;
    indent: string;
    maxDepth: number;
    min: boolean;
    plugins: Plugins;
    printBasicPrototype: boolean;
    printFunctionName: boolean;
    spacingInner: string;
    spacingOuter: string;
};
export declare type Printer = (val: unknown, config: Config, indentation: string, depth: number, refs: Refs, hasCalledToJSON?: boolean) => string;
declare type Test = (arg0: any) => boolean;
export declare type NewPlugin = {
    serialize: (val: any, config: Config, indentation: string, depth: number, refs: Refs, printer: Printer) => string;
    test: Test;
};
declare type PluginOptions = {
    edgeSpacing: string;
    min: boolean;
    spacing: string;
};
export declare type OldPlugin = {
    print: (val: unknown, print: Print, indent: Indent, options: PluginOptions, colors: Colors) => string;
    test: Test;
};
export declare type Plugin = NewPlugin | OldPlugin;
export declare type Plugins = Array<Plugin>;

export declare const DEFAULT_OPTIONS: Options;
/**
 * Returns a presentation string of your `val` object
 * @param val any potential JavaScript object
 * @param options Custom settings
 */
export declare function format(val: unknown, options?: OptionsReceived): string;
export declare const plugins: {
    AsymmetricMatcher: NewPlugin;
    ConvertAnsi: NewPlugin;
    DOMCollection: NewPlugin;
    DOMElement: NewPlugin;
    Immutable: NewPlugin;
    ReactElement: NewPlugin;
    ReactTestComponent: NewPlugin;
};
export default format;
