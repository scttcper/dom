/**
 * Accessible names of HTML elements.
 *
 * Spec: HTML Accessibility API Mappings 1.0, §4.1 "Accessible Name Computations By HTML Element"
 *   https://w3c.github.io/html-aam/#accessible-name-computations-by-html-element
 * and §4.2 "Accessible Description Computation"
 *   https://w3c.github.io/html-aam/#accessible-description-computation
 *
 * Every assertion runs on both engines (helpers.ts `both`): @ctrl/dom/aria on @ctrl/dom and
 * dom-accessibility-api@0.5.16 on jsdom. Tests prefixed "oracle:" pin a documented deviation
 * of that oracle from HTML-AAM (docs/deviations.md, "Accessible names follow
 * dom-accessibility-api@0.5.16"), with the spec's value in a comment.
 */
import { describe, expect, test } from "vitest";
import { both, testNode } from "./helpers.ts";

function expectName(html: string, expected: string): void {
  expect(both(html, (api, doc) => api.name(testNode(doc)))).toEqual({ "ctrl-dom": expected, upstream: expected });
}

function expectDescription(html: string, expected: string): void {
  expect(both(html, (api, doc) => api.description(testNode(doc)))).toEqual({ "ctrl-dom": expected, upstream: expected });
}

const AAM = "https://w3c.github.io/html-aam/";

describe(`4.1.1 input type=text, password, number, search, tel, email, url and textarea — ${AAM}#input-type-text-input-type-password-input-type-number-input-type-search-input-type-tel-input-type-email-input-type-url-and-textarea-elements-accessible-name-computation`, () => {
  test("step 1-2: aria-labelledby, then aria-label", () => {
    expectName(`<span id="l">Ref</span><input data-test aria-labelledby="l" aria-label="Label">`, "Ref");
    expectName(`<input data-test type="search" aria-label="Find">`, "Find");
  });

  test("step 3: the associated <label> elements", () => {
    for (const type of ["text", "password", "number", "search", "tel", "email", "url"]) {
      expectName(`<label for="i">Field</label><input data-test id="i" type="${type}">`, "Field");
    }
    expectName(`<label>Bio <textarea data-test>text</textarea></label>`, "Bio");
  });

  test("step 4: title", () => {
    expectName(`<input data-test title="Phone">`, "Phone");
    expectName(`<textarea data-test title="Notes"></textarea>`, "Notes");
  });

  test("oracle: placeholder is not a name source", () => {
    // HTML-AAM step 5 uses placeholder (and aria-placeholder) when nothing else names the input.
    expectName(`<input data-test placeholder="Search…">`, "");
    expectName(`<textarea data-test placeholder="Write…"></textarea>`, "");
  });

  test("the value is not the input's own name", () => {
    expectName(`<input data-test value="typed">`, "");
  });
});

describe(`4.1.2 input type=button, submit and reset — ${AAM}#input-type-button-input-type-submit-and-input-type-reset-elements-accessible-name-computation`, () => {
  test("the value attribute names the button", () => {
    expectName(`<input data-test type="button" value="Run">`, "Run");
    expectName(`<input data-test type="submit" value="Send">`, "Send");
    expectName(`<input data-test type="reset" value="Clear">`, "Clear");
  });

  test("submit and reset fall back to their UA default label; button has none", () => {
    expectName(`<input data-test type="submit">`, "Submit");
    expectName(`<input data-test type="reset">`, "Reset");
    expectName(`<input data-test type="button">`, "");
    expectName(`<input data-test type="button" title="Tip">`, "Tip");
  });

  test("aria-label beats value", () => {
    expectName(`<input data-test type="submit" value="Send" aria-label="Send form">`, "Send form");
  });

  test("oracle: value is used before an associated <label>", () => {
    // HTML-AAM lists <label> before value for these buttons.
    expectName(`<label for="b">Label</label><input data-test id="b" type="button" value="Value">`, "Value");
  });
});

describe(`4.1.3 input type=image — ${AAM}#input-type-image-element-accessible-name-computation`, () => {
  test("alt, then title, then the UA default", () => {
    expectName(`<input data-test type="image" alt="Go" title="Tip">`, "Go");
    expectName(`<input data-test type="image" title="Tip">`, "Tip");
    expectName(`<input data-test type="image">`, "Submit Query");
  });

  test("a blank alt is skipped", () => {
    expectName(`<input data-test type="image" alt="  " title="Tip">`, "Tip");
  });
});

describe(`4.1.4 button element — ${AAM}#button-element-accessible-name-computation`, () => {
  test("named by its subtree, then title", () => {
    expectName(`<button data-test title="Tip">Save <b>now</b></button>`, "Save now");
    expectName(`<button data-test title="Tip"></button>`, "Tip");
  });

  test("a <label> for a button names it (the button is a labelable element)", () => {
    expectName(`<label for="b">Label</label><button data-test id="b">Content</button>`, "Label");
  });
});

describe(`4.1.5 fieldset element — ${AAM}#fieldset-element-accessible-name-computation`, () => {
  test("the first child <legend> names the fieldset; title otherwise", () => {
    expectName(`<fieldset data-test><legend>Contact <i>info</i></legend><input></fieldset>`, "Contact info");
    expectName(`<fieldset data-test title="Tip"><input></fieldset>`, "Tip");
  });

  test("a legend that is not a child does not count", () => {
    expectName(`<fieldset data-test><div><legend>Nested</legend></div></fieldset>`, "");
  });
});

describe(`4.1.6 output element — ${AAM}#output-element-accessible-name-computation`, () => {
  test("named by its <label>, then title (not by its content)", () => {
    expectName(`<label for="o">Total</label><output data-test id="o">42</output>`, "Total");
    expectName(`<output data-test title="Sum">42</output>`, "Sum");
    expectName(`<output data-test>42</output>`, "");
  });
});

describe(`4.1.7 other form elements — ${AAM}#other-form-elements-accessible-name-computation`, () => {
  test("select, meter, progress, checkbox, radio, range are named by <label>, aria-label or title", () => {
    expectName(`<label for="s">Country</label><select data-test id="s"><option>NL</option></select>`, "Country");
    expectName(`<label>Disk <meter data-test value="0.5"></meter></label>`, "Disk");
    expectName(`<progress data-test aria-label="Upload"></progress>`, "Upload");
    expectName(`<input data-test type="checkbox" title="Agree">`, "Agree");
    expectName(`<label><input data-test type="radio"> Free</label>`, "Free");
    expectName(`<label for="r">Volume</label><input data-test id="r" type="range">`, "Volume");
  });

  test("a hidden input is not labelable and has no name from <label>", () => {
    expectName(`<label for="h">Token</label><input data-test id="h" type="hidden">`, "");
  });
});

describe(`4.1.8 summary element — ${AAM}#summary-element-accessible-name-computation`, () => {
  test("a <summary> is named from its subtree, before title", () => {
    expectName(`<details><summary data-test>More <b>info</b></summary><p>x</p></details>`, "More info");
    expectName(`<details><summary data-test title="Tip">More info</summary><p>x</p></details>`, "More info");
  });
});

describe(`4.1.9 figure element — ${AAM}#figure-element-accessible-name-computation`, () => {
  test("oracle: figcaption is not a name source", () => {
    // HTML-AAM names a figure from its first figcaption child.
    expectName(`<figure data-test><img alt="x"><figcaption>Caption</figcaption></figure>`, "");
    expectName(`<figure data-test aria-label="Fig 1"><figcaption>Caption</figcaption></figure>`, "Fig 1");
  });
});

describe(`4.1.10 img element — ${AAM}#img-element-accessible-name-computation`, () => {
  test("alt, then title", () => {
    expectName(`<img data-test alt="Logo" title="Tip">`, "Logo");
    expectName(`<img data-test title="Tip">`, "Tip");
  });

  test("an empty alt makes the image presentational: no name, not even from title", () => {
    expectName(`<img data-test alt="" title="Tip">`, "");
  });
});

describe(`4.1.11 table element — ${AAM}#table-element-accessible-name-computation`, () => {
  test("the first <caption> child, then title", () => {
    expectName(`<table data-test title="Tip"><caption>Cap</caption></table>`, "Cap");
    expectName(`<table data-test title="Tip"><tbody><tr><td>x</td></tr></tbody></table>`, "Tip");
  });
});

describe(`4.1.12 tr, td, th elements — ${AAM}#tr-td-th-elements-accessible-name-computation`, () => {
  test("cells and headers are named from their subtree", () => {
    expectName(`<table><tbody><tr><td data-test>Cell <b>1</b></td></tr></tbody></table>`, "Cell 1");
    expectName(`<table><thead><tr><th data-test>Header</th></tr></thead></table>`, "Header");
  });

  test("a row is named from its cells (space separated: cells are not inline)", () => {
    expectName(`<table><tbody><tr data-test><td>a</td><td>b</td></tr></tbody></table>`, "a b");
  });
});

describe(`4.1.13 a element — ${AAM}#a-element-accessible-name-computation`, () => {
  test("a link is named by its subtree, then title", () => {
    expectName(`<a data-test href="/x" title="Tip">Docs <img alt="icon"></a>`, "Docs icon");
    expectName(`<a data-test href="/x" title="Tip"></a>`, "Tip");
  });

  test("an <a> without href is generic and not named from content", () => {
    expectName(`<a data-test>Anchor</a>`, "");
  });
});

describe(`4.1.14 area element — ${AAM}#area-element-accessible-name-computation`, () => {
  test("alt names the area (display:none in the UA sheet, so only with hidden content included)", () => {
    expect(
      both(`<map name="m"><area data-test href="/a" alt="North"></map>`, (api, doc) => api.name(testNode(doc), { hidden: true })),
    ).toEqual({ "ctrl-dom": "North", upstream: "North" });
  });
});

describe(`4.1.15 iframe element — ${AAM}#iframe-element-accessible-name-computation`, () => {
  test("title names an iframe", () => {
    expectName(`<iframe data-test title="Video player"></iframe>`, "Video player");
  });
});

describe(`4.1.16 section and grouping elements — ${AAM}#section-and-grouping-element-accessible-name-computation`, () => {
  test("only aria-labelledby, aria-label and title name sections; content does not", () => {
    expectName(`<nav data-test>Links</nav>`, "");
    expectName(`<section data-test aria-label="Intro">x</section>`, "Intro");
    expectName(`<main data-test title="Content">x</main>`, "Content");
    expectName(`<h2 id="h">Heading</h2><article data-test aria-labelledby="h">x</article>`, "Heading");
  });
});

describe(`4.1.17 text-level elements — ${AAM}#text-level-element-accessible-name-computation`, () => {
  test("abbr, em, mark ... are not named from content; title is the fallback", () => {
    expectName(`<abbr data-test title="HyperText Markup Language">HTML</abbr>`, "HyperText Markup Language");
    expectName(`<mark data-test>marked</mark>`, "");
  });
});

describe(`4.2 accessible description computation — ${AAM}#accessible-description-computation`, () => {
  test("aria-describedby, joined in IDREF order", () => {
    expectDescription(`<span id="a">One</span><span id="b">Two</span><button data-test aria-describedby="b a">x</button>`, "Two One");
  });

  test("title is the description when it was not used for the name", () => {
    expectDescription(`<button data-test title="More">Save</button>`, "More");
  });

  test("aria-describedby wins over title", () => {
    expectDescription(`<span id="a">Ref</span><button data-test title="More" aria-describedby="a">Save</button>`, "Ref");
  });

  test("oracle: title is also returned when it was already used as the name", () => {
    // HTML-AAM uses title as the description only if it was not the name.
    expectDescription(`<button data-test title="Tip"></button>`, "Tip");
  });

  test("oracle: aria-description is not a source (dom-accessibility-api 0.5)", () => {
    expectDescription(`<button data-test aria-description="Extra">x</button>`, "");
  });

  test("described-by content is computed from the referenced subtree, including hidden roots", () => {
    expectDescription(`<div id="d" hidden>Hidden <b>help</b></div><input data-test aria-describedby="d">`, "Hidden help");
  });
});
