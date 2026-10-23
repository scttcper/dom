// Types for the ported WPT data module (selectors.data.js).
export interface InvalidSelector {
  name: string;
  selector: string;
}
export interface ValidSelector {
  name: string;
  selector: string;
  expect: string[];
  exclude?: string[];
  level?: number;
  testType: number;
  ctx?: string;
  ref?: string;
}
export declare const TEST_QSA: number;
export declare const TEST_FIND: number;
export declare const TEST_MATCH: number;
export declare const invalidSelectors: InvalidSelector[];
export declare const validSelectors: ValidSelector[];
export declare const scopedSelectors: ValidSelector[];
