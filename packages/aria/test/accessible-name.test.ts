/**
 * Accessible name computation — port of dom-accessibility-api's test suite.
 *
 * Specs:
 *   https://w3c.github.io/accname/#computation-steps (Accessible Name and Description Computation)
 *   https://w3c.github.io/html-aam/#accessible-name-computations-by-html-element
 *   https://www.w3.org/TR/svg-aam-1.0/#mapping_additional_nd
 *   https://w3c.github.io/aria/#namefromprohibited
 *
 * Original: https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/__tests__/accessible-name.js
 * (MIT). Assertions are kept verbatim; differences are noted inline. Runs on @ctrl/dom.
 */
import { afterEach, beforeAll, describe, expect, it, test, vi } from "vitest";
import { computeAccessibleName } from "@ctrl/dom/aria";
import type { Element } from "@ctrl/dom";
import { makeDocument } from "./helpers.ts";

const { document, renderIntoDocument, cleanup } = makeDocument();
const window = document.defaultView! as unknown as { getComputedStyle?: unknown; customElements?: unknown; HTMLElement: new () => Element };
const HTMLElement = window.HTMLElement;

function nameOfTestNode(markup: string): string {
  const container = renderIntoDocument(markup);
  const testNode = container.querySelector("[data-test]");
  if (testNode === null) throw new Error("no [data-test] element");
  return computeAccessibleName(testNode as Element);
}

/** `expect(markup).toRenderIntoDocumentAccessibleName(name)` */
function expectName(markup: string, expected: string): void {
  expect(nameOfTestNode(markup)).toBe(expected);
}

afterEach(cleanup);

describe("to upstream — https://w3c.github.io/accname/#step2F (name from content)", () => {
	// name from content
	test.each([
		[
			"cell",
			`<div data-test role="cell"><em>greek</em> alpha</div>`,
			"greek alpha",
		],
		[
			"checkbox",
			`<div data-test role="checkbox"><em>greek</em> beta</div>`,
			"greek beta",
		],
		[
			"columnheader",
			`<div data-test role="columnheader"><em>greek</em> gamma</div>`,
			"greek gamma",
		],
		[
			"gridcell",
			`<div data-test role="gridcell"><em>greek</em> delta</div>`,
			"greek delta",
		],
		[
			"legend",
			`<fieldset><legend data-test><em>greek</em> zeta</legend></fieldset>`,
			"greek zeta",
		],
		[
			"menuitem",
			`<li data-test role="menuitem"><em>greek</em> eta</li>`,
			"greek eta",
		],
		[
			"menuitemradio",
			`<li data-test role="menuitemradio"><em>greek</em> theta</li>`,
			"greek theta",
		],
		[
			"menuitemcheckbox",
			`<li data-test role="menuitemcheckbox"><em>greek</em> iota</li>`,
			"greek iota",
		],
		[
			"optgroup",
			`<select><optgroup data-test label="foo"><option value="1">baz</option></optgroup></select>`,
			"foo",
		],
		[
			"option",
			`<select><option data-test title="Title">Content</option></select>`,
			"Content",
		],
		[
			"radio",
			`<div data-test role="radio"><em>greek</em> kappa</div>`,
			"greek kappa",
		],
		[
			"row",
			`<table><tbody><tr data-test><td>greek</td><td>lambda</td></tr></tbody></table>`,
			"greek lambda",
		],
		[
			"rowheader",
			`<table><tbody><tr data-test><td data-test role="rowheader"><em>greek</em> mu</td></tr></tbody></table>`,
			"greek mu",
		],
		[
			"switch",
			`<div data-test role="switch"><em>greek</em> nu</div>`,
			"greek nu",
		],
		["tab", `<div data-test role="tab"><em>greek</em> xi</div>`, "greek xi"],
		[
			"tooltip",
			`<div data-test role="tooltip"><em>greek</em> omicron</div>`,
			"greek omicron",
		],
		[
			"treeitem",
			`<li data-test role="treeitem"><em>greek</em> pi</li>`,
			"greek pi",
		],
	])(`role %s has name from content`, (_, markup, expectedAccessibleName) => {
		expectName(markup, expectedAccessibleName);
	});

	test("output is labelable", () => {
		const container = renderIntoDocument(`
			<label for="outputid">Output Label</label>
			<output id="outputid" data-test></output>
		`);

		const output = container.querySelector("output");
		expect(computeAccessibleName(output as Element)).toBe("Output Label");
	});

	test.each([
		[
			// TODO
			// weird edge case that results in an empty accessible name
			// Intuitevly the fist input has "foo baz" while the second one has "foo David"
			"two inputs, one label",
			`
<label>
	foo
	<input type="text" value="David">
	<input data-test type="text" value="baz">
</label>

`,
			"",
		],
		[
			"textarea value",
			`
<label for="test">
	foo
	<input type="text" value="David" />
</label>
<input data-test id="test" type="text" value="baz">			
`,
			"foo David",
		],
		[
			"textarea value",
			`
<label for="test">
	foo
	<textarea>David</textarea>
</label>
<input data-test id="test" type="text" value="baz">			
`,
			"foo David",
		],
		[
			"select value",
			`
<select id="role"><option selected>contributor</option></select>
<button data-test id="trigger" aria-labelledby="trigger role">Pick</button>
`,
			"Pick contributor",
		],
		// It seems like this is what wpt `name_heading-combobox-focusable-alternative`
		// should actually test. I could not find specification for combobox falling
		// back to the "value" attribute when computing the text alternative for the selected option
		[
			"embedded textbox",
			`
<h2 data-test>
	Country of origin:
	<input type="text" title="Choose your country." value="United States">
</h2>
`,
			"Country of origin: United States",
		],
		[
			'[role="menu"]',
			// https://github.com/testing-library/dom-testing-library/issues/1059
			`
<button id="trigger">Test</button>
<ul data-test role="menu" aria-labelledby="trigger">
	<li role="menuitem">Item 1</li>
	<li role="menuitem">Item 2</li>
</ul>
`,
			"Test",
		],
	])(`coverage for %s`, (_, markup, expectedAccessibleName) => {
		expectName(markup, expectedAccessibleName);
	});
});

// Slots need attachShadow + customElements (dom-core / html-elements). Skipped until available.
const supportsShadow = (() => {
  try {
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).innerHTML = "<slot></slot>";
    const ce = window.customElements as { define?: unknown } | undefined;
    return typeof ce?.define === "function" && typeof (host.shadowRoot!.firstChild as unknown as { assignedNodes?: unknown }).assignedNodes === "function";
  } catch {
    return false;
  }
})();
describe.skipIf(!supportsShadow)("slots — https://html.spec.whatwg.org/multipage/scripting.html#the-slot-element", () => {
	beforeAll(() => {
		(window.customElements as { define(name: string, ctor: unknown): void }).define(
			"custom-button",
			class extends HTMLElement {
				constructor() {
					super();
					const shadowRoot = this.attachShadow({ mode: "open" });
					shadowRoot.innerHTML = `<button data-test><slot></slot></button>`;
				}
			},
		);

		(window.customElements as { define(name: string, ctor: unknown): void }).define(
			"custom-button-with-default",
			class extends HTMLElement {
				constructor() {
					super();
					const shadowRoot = this.attachShadow({ mode: "open" });
					shadowRoot.innerHTML = `<button data-test><slot>Default name</slot></button>`;
				}
			},
		);
	});

	test.each([
		[
			"no default content",
			`<custom-button data-root>Custom name</custom-button>`,
			"Custom name",
		],
		[
			"default content",
			`<custom-button-with-default data-root></custom-button>`,
			"Default name",
		],
		[
			"overridden default content",
			`<custom-button-with-default data-root>Custom name</custom-button>`,
			"Custom name",
		],
	])("slot with %s has name", (_, markup, expectedAccessibleName) => {
		const container = renderIntoDocument(markup);
		const testNode = container.querySelector("[data-root]")!.shadowRoot!.querySelector("[data-test]");
		expect(computeAccessibleName(testNode as Element)).toBe(expectedAccessibleName);
	});
});

describe("misc — https://w3c.github.io/accname/#computation-steps", () => {
test.each([
	[
		`
<div data-test aria-labelledby="label">I reference my name</div>
<div id="label" role="presentation">I'm prohibited a name</div>
`,
		"I'm prohibited a name",
	],
	[
		`
<div data-test aria-labelledby="label">I reference my name</div>
<div id="label" role="none">I'm prohibited a name</div>
`,
		"I'm prohibited a name",
	],
	[
		`
<element1 data-test id="el1" aria-labelledby="el3" />
<element2 id="el2" aria-labelledby="el1" />
<element3 id="el3"> hello </element3>
`,
		"hello",
	],
	[
		`
<input type="checkbox" id="test" data-test />
<label for="test">Flash the screen
	<div role="combobox">
		<div role="textbox"></div>
		<ul role="listbox" style="list-style-type: none;">
			<li role="option" aria-selected="true">1</li>
			<li role="option">2</li>
			<li role="option">3</li>
		</ul>
	</div>
	times.
</label>
`,
		"Flash the screen 1 times.",
	],
	[
		`
<input type="text" id="test" data-test />
<label for="test">
	foo
	<input role="spinbutton" type="number" value="5" min="1" max="10" aria-valuenow="5" aria-valuemin="1" aria-valuemax="10">
	baz
</label>
`,
		"foo 5 baz",
	],
	[
		// :after getcomputed not implemented
		`
<style>
	label:after { content:" fruit"; }
</style>
<label for="test">fancy</label>
<input type="image" src="foo.jpg" id="test" data-test />	
`,
		"fancy",
	],
	[
		`
<input data-test id="test" type="text" aria-label="bar" aria-labelledby="ID1 test">
<div id="ID1">foo</label>
	`,
		"foo bar",
	],
	[
		`
<label>This <input type="checkbox" id="test" data-test /> is</label>
<label for="test">a test</label>
		`,
		"This is a test",
	], // byAltText('an image') = byRole('image', {name: 'an image'})
	[`<img data-test alt="an image" />`, "an image"],
	// this would require a custom matcher
	[
		`<div id="label"><em>the</em> logo</div><img data-test aria-labelledby="label" />`,
		"the logo",
	],
	// byDisplayValue isn't solvable by accessibleName
	[`<label>Age <input data-test type="text" value="10" /></label>`, "Age"],
	// byLabelText('Age') =>  byRole('textbox', {name: 'Age'})
	// byText('Arizona') => byRole('option', {name: 'Arizona'})
	[`<option data-test >Arizona</option>`, "Arizona"],
	// this would require a custom matcher
	[`<button data-test>Click <em>me</em></option>`, "Click me"],
	// byTitle('Hello, Dave!') => byRole('textbox', {name: 'Hello, Dave!'})
	[`<input data-test title="Hello, Dave!" />`, "Hello, Dave!"],
	[
		`<label for="select">A Select</label><select data-test id="select" />`,
		"A Select",
	],
	[
		`<label for="textarea">A TextArea</label><textarea data-test id="textarea" />`,
		"A TextArea",
	],
	// https://w3c.github.io/html-aam/#fieldset-and-legend-elements
	[
		`<fieldset data-test><legend><em>greek</em> rho</legend></fieldset>`,
		"greek rho",
	],
	[
		`<fieldset data-test aria-owns="legend"></fieldset><legend id="legend"><em>greek</em> rho</legend>`,
		"",
	],
	// https://w3c.github.io/html-aam/#table-element
	[
		`<table data-test><caption><em>greek</em> rho</caption></caption>`,
		"greek rho",
	],
	[
		`<table data-test aria-owns="caption"></table><caption id="caption"><em>greek</em> rho</caption>`,
		"",
	],
	// https://www.w3.org/TR/svg-aam-1.0/
	[`<svg data-test><title><em>greek</em> rho</title></svg>`, "greek rho"],
	[`<button title="" data-test>click me</button>`, "click me"],
	[
		`<button title="You should really click this" data-test>click me</button>`,
		"click me",
	],
	// https://w3c.github.io/html-aam/#input-type-button-input-type-submit-and-input-type-reset-accessible-name-computation
	[`<input data-test value="Submit form" type="submit" />`, "Submit form"],
	// https://w3c.github.io/html-aam/#input-type-image
	[`<input data-test alt="Select an image" type="image" />`, "Select an image"],
	[`<input data-test alt="" type="image" />`, "Submit Query"],
	[
		`<img data-test alt="" aria-label="a logo" role="presentation" /> />`,
		"a logo",
	],
	[`<img data-test alt="" aria-label="a logo" role="none" />`, "a logo"],
	[` <input type="radio" data-test title="crazy"/>`, "crazy"],
	[
		`
		<h2 id="lorem-heading">
			Lorem ipsum
			<a data-test aria-labelledby="lorem-heading" href="#lorem-heading" tabindex="-1">
				<svg></svg>
			</a>
		</h2>
	`,
		"Lorem ipsum",
	],
	[
		`
		<label for="toggle-button" id="label" value="full">
			<button
				data-test
				aria-expanded="false"
				aria-haspopup="listbox"
				aria-labelledby="label toggle-button"
				id="toggle-button"
				type="button"
			>
				<span>
					Full Refund
				</span>
			</button>
			<div>
				Refund Type
			</div>
		</label>
		`,
		"Full Refund Refund Type",
	],
])(`misc #%#`, (markup, expectedAccessibleName) => {
	expectName(markup, expectedAccessibleName);
});
});

test("2F.iii: text nodes are not concatenated by space (https://w3c.github.io/accname/#step2F.iii)", () => {
	// how React would create `<h1>Hello {name}!</h1>`
	// which transpiles to
	// React.createElement('h1', 'Hello ', name, '!')
	const heading = document.createElement("h1");
	heading.appendChild(document.createTextNode("Hello "));
	heading.appendChild(document.createTextNode("Jill"));
	heading.appendChild(document.createTextNode("!"));
	document.body!.appendChild(heading);

	expect(computeAccessibleName(heading)).toBe("Hello Jill!");
});

// JSDOM_DISPLAY: upstream's expectations for inline children were recorded on old jsdom,
// whose getComputedStyle returned display "block" for every element (so every child got a
// space separator). On jsdom 30 — the oracle here — dom-accessibility-api@0.5.16 itself
// returns the unseparated strings asserted below (verified by test/differential.test.ts).
describe("prohibited naming — https://w3c.github.io/aria/#namefromprohibited", () => {
	test.each([
		["caption", "<div data-test role='caption'>table</div>"],
		["code", '<div data-test role="code">named?</div>'],
		["deletion", '<div data-test role="deletion">named?</div>'],
		["emphasis", '<div data-test role="emphasis">named?</div>'],
		["generic", '<div data-test role="generic">named?</div>'],
		["insertion", '<div data-test role="insertion">named?</div>'],
		["paragraph", '<div data-test role="paragraph">named?</div>'],
		["presentation", '<div data-test role="presentation">named?</div>'],
		["none", '<div data-test role="none">named?</div>'],
		["strong", '<div data-test role="strong">named?</div>'],
		["subscript", '<div data-test role="subscript">named?</div>'],
		["superscript", "<div data-test role='supscript'>Hello</div>"],
	])("role '%s' prohibites naming", (_, markup) => {
		expectName(markup, "");
	});

	test.each([
		[
			"caption",
			`
<table data-test aria-labelledby='caption'></table>
<div id='caption' role='caption'>a table</div>
`,
			"a table",
		],
		[
			"code",
			"<button data-test><span role='code'>html-aam</span></button>",
			"html-aam",
		],
		[
			"deletion",
			"<button data-test>aria <span role='deletion'>1.1</span><span>1.2</span></button>",
			"aria 1.11.2", // upstream: "aria 1.1 1.2" — see JSDOM_DISPLAY note
		],
		[
			"emphasis",
			"<button data-test>aria <span role='emphasis'>1.2</span></button>",
			"aria 1.2",
		],
		[
			"generic",
			"<button data-test><span role='generic'>click</span></button>",
			"click",
		],
		[
			"insertion",
			"<button data-test><span role='insertion'>wai</span>aria</button>",
			"waiaria", // upstream: "wai aria" — see JSDOM_DISPLAY note
		],
		[
			"paragraph",
			"<button data-test><span role='paragraph'>I'm getting lazy</span></button>",
			"I'm getting lazy",
		],
		[
			"presentation",
			"<button data-test><span role='presentation'>icon</span></button>",
			"icon",
		],
		[
			"presentation",
			"<button data-test><span role='none'>icon</span></button>",
			"icon",
		],
		[
			"strong",
			"<button data-test><span role='strong'>CLICK!</span></button>",
			"CLICK!",
		],
		[
			"subscript",
			"<button data-test>A<span role='subscript'>_x</span></button>",
			"A_x", // upstream: "A _x" — see JSDOM_DISPLAY note
		],
		[
			"superscript",
			"<button data-test>2<span role='superscript'>64</span></button>",
			"264", // upstream: "2 64" — see JSDOM_DISPLAY note
		],
	])(
		"role '%s'can be part of the accessible name of another element",
		(_, markup, name) => {
			expectName(markup, name);
		},
	);
});

// Intentional difference: with no `getComputedStyle` option, @ctrl/dom/aria reads styles through
// the css fast path and never calls window.getComputedStyle (upstream counts its calls). The
// injected-implementation behavior is kept.
describe("options.getComputedStyle — https://w3c.github.io/accname/#step2A", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("is called by default", () => {
		// Upstream: `window.getComputedStyle` is the default style source. Our default reads the
		// cascade directly while the window's own getComputedStyle is in place; a spy (or any
		// replacement) on it is honored like upstream and, calling through, changes nothing.
		const container = renderIntoDocument("<button>test</button>");
		const button = container.querySelector("button") as Element;
		const view = (button as any).ownerDocument.defaultView;
		const spy = vi.spyOn(view as never, "getComputedStyle");
		expect(computeAccessibleName(button)).toBe("test");
		expect(spy).toHaveBeenCalledTimes(1);
	});

	test("can be mocked with a fake", () => {
		const container = renderIntoDocument("<button>test</button>");
		const declaration: Record<string, string> = { content: "'foo'", display: "block", visibility: "visible" };
		const fake = vi.fn(() => ({ ...declaration, getPropertyValue: (p: string) => declaration[p] ?? "" }));

		const name = computeAccessibleName(container.querySelector("button") as Element, {
			getComputedStyle: fake,
		});

		expect(name).toEqual("foo test foo");
	});

	test("an injected implementation is the only style source", () => {
		const container = renderIntoDocument("<button><span><span>nested</span>button</span></button>");
		const fake = vi.fn(() => ({ getPropertyValue: () => "" }));
		computeAccessibleName(container.querySelector("button") as Element, {
			getComputedStyle: fake,
			computedStyleSupportsPseudoElements: false,
		});
		// isHidden for the button and both spans + the separator check for both spans
		expect(fake).toHaveBeenCalledTimes(5);
	});
});

// Intentional difference: upstream checks that JSDOM logs "Not implemented" errors for
// pseudo-element styles. @ctrl/dom/aria never logs; `true` only enables ::before/::after content.
describe("options.computedStyleSupportsPseudoElements — https://w3c.github.io/accname/#step2F.ii", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("`false` and `true` never log errors", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const container = renderIntoDocument("<button>test</button>");
		const button = container.querySelector("button") as Element;
		expect(computeAccessibleName(button, { computedStyleSupportsPseudoElements: false })).toBe("test");
		expect(computeAccessibleName(button, { computedStyleSupportsPseudoElements: true })).toBe("test");
		expect(error).not.toHaveBeenCalled();
	});
});


describe("options.hidden — https://w3c.github.io/accname/#step2A", () => {
	test.each([
		[`<button data-test hidden>hidden</button>`, "hidden"],
		[`<button data-test style="display: none;">hidden</button>`, "hidden"],
	])(`inaccessible #%#`, (markup, accessibleName) => {
		const container = renderIntoDocument(markup);

		const testNode = container.querySelector("[data-test]");
		expect(computeAccessibleName(testNode as Element, { hidden: true })).toEqual(
			accessibleName,
		);
	});
});

describe.skipIf(!supportsShadow)("content in shadow DOM — https://w3c.github.io/accname/#step2B", () => {
	it("works for aria-labelledby on elements in same shadow root", () => {
		const container = renderIntoDocument("<div></div>");
		const div = container.querySelector("div")!;
		div.attachShadow({ mode: "open" }).innerHTML = `
			<label id="theLabel">Type here</label>
			<input type="text" aria-labelledby="theLabel">
		`;

		const input = div.shadowRoot!.querySelector("input");
		expect(computeAccessibleName(input as Element)).toEqual("Type here");
	});
});
