// Port of @testing-library/dom src/screen.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/screen.ts

import { compressToEncodedURIComponent } from "./lz-string.ts";
import { getQueriesForElement } from "./get-queries-for-element.ts";
import { getDocument } from "./helpers.ts";
import { logDOM } from "./pretty-dom.ts";
import { queries } from "./queries/ordered.ts";
import { ariaSnapshot } from "./aria-snapshot.ts";

declare const document: any;

function unindent(string: string): string {
  // remove white spaces first, to save a few bytes.
  // testing-playground will reformat on load any ways.
  return string.replace(/[ \t]*[\n][ \t]*/g, "\n");
}

function encode(value: string): string {
  return compressToEncodedURIComponent(unindent(value));
}

function getPlaygroundUrl(markup: string): string {
  return `https://testing-playground.com/#markup=${encode(markup)}`;
}

const debug = (element?: any, maxLength?: number, options?: any): void =>
  Array.isArray(element) ? element.forEach((el) => logDOM(el, maxLength, options)) : logDOM(element, maxLength, options);

const logTestingPlaygroundURL = (element = getDocument().body): string | undefined => {
  if (!element || !("innerHTML" in element)) {
    console.log(`The element you're providing isn't a valid DOM element.`);
    return;
  }
  if (!element.innerHTML) {
    console.log(`The provided element doesn't have any children.`);
    return;
  }
  const playgroundUrl = getPlaygroundUrl(element.innerHTML);
  console.log(`Open this URL in your browser\n\n${playgroundUrl}`);
  return playgroundUrl;
};

// Ours: `screen.ariaSnapshot(element = document.body, options)`, the accessibility tree as YAML.
const initialValue: Record<string, (...args: any[]) => any> = { debug, logTestingPlaygroundURL, ariaSnapshot };

export const screen: any =
  typeof document !== "undefined" && document.body
    ? getQueriesForElement(document.body, queries as any, initialValue)
    : Object.keys(queries).reduce((helpers, key) => {
        helpers[key] = () => {
          throw new TypeError(
            "For queries bound to document.body a global document has to be available... Learn more: https://testing-library.com/s/screen-global-error",
          );
        };
        return helpers;
      }, initialValue);
