/**
 * Accessible name computation, step by step.
 *
 * Spec: Accessible Name and Description Computation 1.2, §4.3.2 "Computation steps"
 *   https://w3c.github.io/accname/#computation-steps
 * Each describe block names one step (the current editor's draft anchors; dom-accessibility-api
 * and our source comments use the older lettered names #step2A..#step2I, given in brackets).
 *
 * Every assertion runs on both engines (helpers.ts `both`): @ctrl/dom/aria on @ctrl/dom and
 * dom-accessibility-api@0.5.16 on jsdom, the oracle `*ByRole({ name })` users' tests were
 * written against. Where that oracle deviates from the spec the test says so and pins the
 * oracle's value (docs/deviations.md, "Accessible names follow dom-accessibility-api@0.5.16").
 */
import { describe, expect, test } from "vitest";
import { both, testNode } from "./helpers.ts";

function nameOf(html: string, options?: { hidden?: boolean }) {
  return both(html, (api, doc) => api.name(testNode(doc), options));
}

function expectName(html: string, expected: string, options?: { hidden?: boolean }): void {
  expect(nameOf(html, options)).toEqual({ "ctrl-dom": expected, upstream: expected });
}

describe("2A Hidden Not Referenced [step2A] — https://w3c.github.io/accname/#comp_hidden_not_referenced", () => {
  test("a hidden root that is not referenced has an empty name", () => {
    expectName(`<button data-test hidden>Hidden</button>`, "");
    expectName(`<button data-test aria-hidden="true">Hidden</button>`, "");
    expectName(`<button data-test style="display:none">Hidden</button>`, "");
    expectName(`<button data-test style="visibility:hidden">Hidden</button>`, "");
  });

  test("options.hidden skips the step for the root and its descendants", () => {
    expectName(`<button data-test hidden>Hidden <span aria-hidden="true">too</span></button>`, "Hidden too", {
      hidden: true,
    });
  });

  test("hidden descendants (hidden, aria-hidden, display:none, visibility:hidden) contribute nothing", () => {
    expectName(
      `<button data-test>a <span hidden>1</span><span aria-hidden="true">2</span><span style="display:none">3</span><span style="visibility:hidden">4</span> b</button>`,
      "a b",
    );
  });

  test("aria-hidden=false does not hide", () => {
    expectName(`<button data-test>a <span aria-hidden="false">b</span></button>`, "a b");
  });

  test("a directly referenced hidden node is not skipped (aria-labelledby)", () => {
    expectName(
      `<span id="l" hidden>Hidden label</span><button data-test aria-labelledby="l">x</button>`,
      "Hidden label",
    );
    expectName(
      `<span id="l" style="display:none">None label</span><button data-test aria-labelledby="l">x</button>`,
      "None label",
    );
  });

  test("descendants of a referenced hidden node are traversed unless themselves hidden", () => {
    expectName(
      `<div id="l" hidden>a <span>b</span> <span aria-hidden="true">c</span></div><button data-test aria-labelledby="l">x</button>`,
      "a b",
    );
  });

  test("oracle: a hidden <label> contributes nothing, and the control does not fall back to title (2A applies inside 2E)", () => {
    // Spec: an empty 2E result continues to 2I (title). dom-accessibility-api returns the
    // (empty) label text as soon as the control has labels.
    expectName(`<label for="i" hidden>Hidden</label><input data-test id="i" title="Tip">`, "");
    expectName(`<label for="i" hidden>Hidden</label><input data-test id="i" title="Tip">`, "Hidden", { hidden: true });
  });

  test("oracle: a visibility:visible descendant of a visibility:hidden element stays excluded (the whole subtree is skipped)", () => {
    // The spec only excludes nodes that are themselves hidden; dom-accessibility-api stops at
    // the first hidden ancestor, and `*ByRole({ name })` users rely on that.
    expectName(
      `<button data-test>a <span style="visibility:hidden">b <span style="visibility:visible">c</span></span></button>`,
      "a",
    );
  });
});

describe("2B LabelledBy [step2B] — https://w3c.github.io/accname/#comp_labelledby", () => {
  test("step 2: each IDREF is traversed in order and the results are joined with a space", () => {
    expectName(
      `<span id="a">Alpha</span><span id="b">Beta</span><button data-test aria-labelledby="b a">x</button>`,
      "Beta Alpha",
    );
  });

  test("aria-labelledby takes precedence over aria-label, native labels and content", () => {
    expectName(
      `<span id="a">From ref</span><label for="i">From label</label><input data-test id="i" aria-label="From aria-label" aria-labelledby="a">`,
      "From ref",
    );
  });

  test("IDREFs that match no element are ignored; leading/trailing whitespace is ignored", () => {
    expectName(`<span id="a">Alpha</span><button data-test aria-labelledby="  missing   a ">x</button>`, "Alpha");
  });

  test("when no IDREF matches, the computation continues with the later steps", () => {
    expectName(`<button data-test aria-labelledby="missing" aria-label="Fallback">x</button>`, "Fallback");
    expectName(`<button data-test aria-labelledby="">Content</button>`, "Content");
  });

  test("a self-reference uses the element's own aria-label (the referenced root skips 2B but not 2D)", () => {
    expectName(
      `<input data-test id="me" aria-label="Own" aria-labelledby="me other"><span id="other">Other</span>`,
      "Own Other",
    );
  });

  test("step 2 traversal: aria-labelledby is not followed from a referenced node (no recursion)", () => {
    expectName(
      `<span id="a" aria-labelledby="b">A</span><span id="b">B</span><button data-test aria-labelledby="a">x</button>`,
      "A",
    );
  });

  test("a referenced node's aria-label is used instead of its content", () => {
    expectName(
      `<span id="a" aria-label="Labelled">content</span><button data-test aria-labelledby="a">x</button>`,
      "Labelled",
    );
  });

  test("a referenced node's content is used even when its role does not allow name from content", () => {
    expectName(
      `<div id="a"><p>Para</p><ul><li>item</li></ul></div><button data-test aria-labelledby="a">x</button>`,
      "Para item",
    );
  });

  test("oracle: a node referenced twice contributes once (visited nodes are not revisited)", () => {
    expectName(`<span id="a">Alpha</span><button data-test aria-labelledby="a a">x</button>`, "Alpha");
  });
});

describe("2C Embedded Control [step2E in dom-accessibility-api] — https://w3c.github.io/accname/#comp_embedded_control", () => {
  test("step 1 textbox: an embedded text input contributes its value", () => {
    expectName(`<label>Name <input data-test value="Ada"> please</label>`, "Name please");
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Send to <input value="ada@example.com"> now</label>`,
      "Send to ada@example.com now",
    );
  });

  test("step 1 textbox: a <textarea> and a role=textbox element contribute their value / text", () => {
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Note <textarea>hello</textarea></label>`,
      "Note hello",
    );
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Note <span role="textbox">typed</span></label>`,
      "Note typed",
    );
  });

  test("step 2 combobox/listbox: the selected options' text is used", () => {
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Ship to <select><option>NL</option><option selected>DE</option></select></label>`,
      "Ship to DE",
    );
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Pick <div role="listbox"><div role="option">a</div><div role="option" aria-selected="true">b</div></div></label>`,
      "Pick b",
    );
  });

  test("step 2: a multi-select contributes every selected option, space separated", () => {
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Pick <select multiple><option selected>a</option><option>b</option><option selected>c</option></select></label>`,
      "Pick a c",
    );
  });

  test("step 3.1 range: aria-valuetext wins", () => {
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Volume <div role="slider" aria-valuetext="loud" aria-valuenow="9"></div></label>`,
      "Volume loud",
    );
  });

  test("step 3.2 range: else aria-valuenow", () => {
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Volume <div role="spinbutton" aria-valuenow="9"></div></label>`,
      "Volume 9",
    );
  });

  test("step 3.3 range: else the host language value (input type=range)", () => {
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Volume <input type="range" value="7"></label>`,
      "Volume 7",
    );
  });

  test("embedded controls are also reached through aria-labelledby", () => {
    expectName(`<div id="l">Rows <input value="10"></div><button data-test aria-labelledby="l">x</button>`, "Rows 10");
  });

  test("the control's own aria-label is ignored while it is embedded (2D step 1)", () => {
    expectName(
      `<input type="checkbox" data-test id="c"><label for="c">Qty <input aria-label="ignored" value="3"></label>`,
      "Qty 3",
    );
  });

  test("the control being named does not embed itself (its label contributes its text only)", () => {
    expectName(`<label>Email <input data-test type="email" value="x@y.z"></label>`, "Email");
  });
});

describe("2D AriaLabel [step2C] — https://w3c.github.io/accname/#comp_label", () => {
  test("step 2: a non-empty aria-label is the name, trimmed", () => {
    expectName(`<button data-test aria-label="  Close dialog  ">×</button>`, "Close dialog");
  });

  test("a whitespace-only aria-label is ignored", () => {
    expectName(`<button data-test aria-label="   ">Content</button>`, "Content");
  });

  test("aria-label beats native labels, alt and title", () => {
    expectName(`<label for="i">Native</label><input data-test id="i" aria-label="Aria">`, "Aria");
    expectName(`<img data-test alt="Alt" title="Title" aria-label="Aria">`, "Aria");
  });

  test("aria-label on a descendant replaces that descendant's content during name from content", () => {
    expectName(`<button data-test>Save <span aria-label="document">📄</span></button>`, "Save document");
  });

  test("role=presentation/none: aria-label is still used (2D precedes the presentational check)", () => {
    expectName(`<button data-test><span role="none" aria-label="labelled">x</span></button>`, "labelled");
  });
});

describe("2E Host Language Label [step2D] — https://w3c.github.io/accname/#comp_host_language_label", () => {
  test("<label for> and a wrapping <label> are concatenated in tree order", () => {
    expectName(`<label for="i">First</label><label>Second <input data-test id="i"></label>`, "First Second");
  });

  test("a label's content is computed with name from content (nested elements, hidden parts)", () => {
    expectName(
      `<label for="i">Your <b>full</b> <span hidden>secret</span>name</label><input data-test id="i">`,
      "Your full name",
    );
  });

  test("img alt; area alt", () => {
    expectName(`<img data-test alt="Logo" title="Ignored">`, "Logo");
    // <area> is display:none in the UA style sheet (https://html.spec.whatwg.org/#hidden-elements),
    // so step 2A drops it unless hidden content is included.
    expectName(`<map name="m"><area data-test href="#" alt="Region"></map>`, "");
    expectName(`<map name="m"><area data-test href="#" alt="Region"></map>`, "Region", { hidden: true });
  });

  test("<fieldset> is named by its first <legend> child", () => {
    expectName(`<fieldset data-test><legend>Shipping</legend><legend>Second</legend></fieldset>`, "Shipping");
  });

  test("<table> is named by its <caption>", () => {
    expectName(
      `<table data-test><caption>Prices <b>2024</b></caption><tbody><tr><td>1</td></tr></tbody></table>`,
      "Prices 2024",
    );
  });

  test("<optgroup> is named by its label attribute", () => {
    expectName(`<select><optgroup data-test label="Fruit"><option>Apple</option></optgroup></select>`, "Fruit");
  });

  test("<svg> is named by its <title> child", () => {
    expectName(`<svg data-test><title>Chart</title><desc>Details</desc></svg>`, "Chart");
  });

  test("role=presentation/none suppresses native labels", () => {
    expectName(`<img data-test role="presentation" alt="Decorative">`, "");
    expectName(`<table data-test role="none"><caption>Cap</caption></table>`, "");
  });
});

describe("2F Name From Content [step2F] — https://w3c.github.io/accname/#comp_name_from_content", () => {
  test("roles that support name from content (button, link, heading, cell, option, tab, ...) are named by their content", () => {
    for (const markup of [
      `<button data-test>Go</button>`,
      `<a data-test href="#">Go</a>`,
      `<h3 data-test>Go</h3>`,
      `<div role="tab" data-test>Go</div>`,
      `<div role="option" data-test>Go</div>`,
      `<div role="treeitem" data-test>Go</div>`,
      `<div role="menuitemcheckbox" data-test>Go</div>`,
      `<div role="switch" data-test>Go</div>`,
      `<div role="tooltip" data-test>Go</div>`,
      `<table><tbody><tr><td data-test>Go</td></tr></tbody></table>`,
    ]) {
      expectName(markup, "Go");
    }
  });

  test("roles that do not support name from content get no name from it (fall through to 2I)", () => {
    expectName(`<nav data-test>Links</nav>`, "");
    expectName(`<ul data-test><li>a</li></ul>`, "");
    expectName(`<div role="dialog" data-test>Body</div>`, "");
    expectName(`<nav data-test title="Site">Links</nav>`, "Site");
  });

  test("step 4: children are visited in order; block-level children are separated by spaces, inline ones are not", () => {
    expectName(`<button data-test><span>in</span><span>line</span></button>`, "inline");
    expectName(`<button data-test><div>block</div><div>level</div></button>`, "block level");
  });

  test("step 4: descendants are recursed (2H), including roles that do not allow name from content", () => {
    expectName(`<a data-test href="#"><div role="dialog">Deep <nav>nested</nav></div></a>`, "Deep nested");
  });

  test("an embedded image contributes its alt, an embedded svg its title", () => {
    expectName(`<button data-test><img alt="Print"> now</button>`, "Print now");
    expectName(`<button data-test><svg><title>Trash</title></svg></button>`, "Trash");
  });

  test("whitespace is flattened: runs collapse to one space and the result is trimmed", () => {
    expectName(
      `<button data-test>
      lots    of
      space </button>`,
      "lots of space",
    );
  });

  test("a <caption> is named from its content, and names its table", () => {
    expectName(`<table><caption data-test>Cap <b>tion</b></caption></table>`, "Cap tion");
    expectName(`<table data-test><caption>Cap</caption></table>`, "Cap");
  });

  test("aria-owns children are appended after the element's own children", () => {
    expectName(`<button data-test aria-owns="o">Own</button><div id="o">owned</div>`, "Own owned");
    expectName(`<button data-test aria-owns="o">Own</button><span id="o">ed</span>`, "Owned");
  });

  test("step 2 generated content: ::before/::after content is not included by default (Testing Library does not enable it)", () => {
    expectName(
      `<style>.p::before { content: "Pre " } .p::after { content: " post" }</style><button data-test class="p">Mid</button>`,
      "Mid",
    );
  });
});

describe("2G Text Node — https://w3c.github.io/accname/#comp_text_node", () => {
  test("text nodes contribute their data; adjacent text nodes are not separated", () => {
    expect(
      both(`<button data-test>x</button>`, (api, doc) => {
        const b = testNode(doc);
        b.textContent = "";
        b.append("Sa", "ve");
        return api.name(b);
      }),
    ).toEqual({ "ctrl-dom": "Save", upstream: "Save" });
  });

  test("comments contribute nothing", () => {
    expectName(`<button data-test>a<!-- ignored -->b</button>`, "ab");
  });
});

describe("2I Tooltip [step2I] — https://w3c.github.io/accname/#comp_tooltip", () => {
  test("title is the last resort for the root", () => {
    expectName(`<input data-test title="Search terms">`, "Search terms");
    expectName(`<div role="region" data-test title="Region tip"></div>`, "Region tip");
  });

  test("title loses to content for roles with name from content", () => {
    expectName(`<button data-test title="Tip">Content</button>`, "Content");
    expectName(`<button data-test title="Tip"></button>`, "Tip");
  });

  test("a descendant's title is not used in name from content recursion", () => {
    expectName(`<button data-test><span title="tip"></span>text</button>`, "text");
  });
});

describe("prohibited naming — https://w3c.github.io/aria/#namefromprohibited", () => {
  test("explicit roles that prohibit naming (generic, paragraph, code, strong, ...) have an empty name even with aria-label", () => {
    for (const role of [
      "generic",
      "paragraph",
      "code",
      "strong",
      "emphasis",
      "deletion",
      "insertion",
      "subscript",
      "superscript",
      "caption",
    ]) {
      expectName(`<span data-test role="${role}" aria-label="x">c</span>`, "");
    }
  });

  test("presentational role conflict resolution: a global aria-label makes role=presentation ignored, so the label names it (https://w3c.github.io/aria/#conflict_resolution_presentation_none)", () => {
    expect(
      both(`<span data-test role="presentation" aria-label="x">c</span>`, (api, doc) => [
        api.role(testNode(doc)),
        api.name(testNode(doc)),
      ]),
    ).toEqual({
      "ctrl-dom": [null, "x"],
      upstream: [null, "x"],
    });
  });

  test("oracle: implicit roles are not consulted (dom-accessibility-api 0.5 getRole is null for div, p, code, ...)", () => {
    for (const tag of ["div", "p", "code", "strong", "del", "sub"]) {
      expectName(`<${tag} data-test aria-label="x">c</${tag}>`, "x");
    }
  });
});
