/**
 * dom-accessibility-api `getRole` — explicit role + html-aria implicit roles.
 *
 * Specs:
 *   https://w3c.github.io/aria/#document-handling_author-errors_roles (first valid token)
 *   https://w3c.github.io/html-aria/#docconformance (implicit ARIA semantics)
 *   https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings
 *   https://w3c.github.io/aria/#conflict_resolution_presentation_none
 *
 * Original: https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/__tests__/getRole.js
 * (MIT). Upstream HEAD (0.6+) treats role="none" like "presentation"; @ctrl/dom/aria's default
 * `getRole` matches 0.5.16 (Testing Library 10.4) and `daa06.getRole` matches 0.6.3 — the
 * role="none" cases are asserted against both below.
 */
import { describe, expect, it } from "vitest";
import { getRole, daa06 } from "@ctrl/dom/aria";
import { makeDocument } from "./helpers.ts";

const { document } = makeDocument();

describe("explicit role — https://w3c.github.io/aria/#document-handling_author-errors_roles", () => {
	it("prioritizes explicit roles", () => {
		const element = document.createElement("div");
		element.setAttribute("role", "textbox");

		expect(getRole(element)).toBe("textbox");
	});

	it("ignores whitespace", () => {
		const element = document.createElement("div");
		element.setAttribute("role", "  textbox  ");

		expect(getRole(element)).toBe("textbox");
	});

	it("uses the first role", () => {
		const element = document.createElement("div");
		element.setAttribute("role", "textbox input");

		expect(getRole(element)).toBe("textbox");
	});

	it("ignores empty roles", () => {
		const element = document.createElement("div");
		element.setAttribute("role", "  ");

		expect(getRole(element)).toBeNull();
	});
});

function createElementFactory(tagName: string, attributes: Record<string, unknown>) {
	return () => {
		const element = document.createElement(tagName);

		for (const [name, value] of Object.entries(attributes)) {
			element.setAttribute(name, String(value));
		}

		return element;
	};
}

// prettier-ignore
const cases: Array<[string, string | null, () => ReturnType<typeof document.createElement>]> = [
	["a element with a href", "link", createElementFactory("a", { href: "any" })],
	["a element without a href", null, createElementFactory("a", {})],
	["abbr", null, createElementFactory("abbr", {})],
	["address", null, createElementFactory("address", {})],
	["area with a href", "link", createElementFactory("area", { href: "any" })],
	["area without a href", null, createElementFactory("area", {})],
	["article", "article", createElementFactory("article", {})],
	["aside", "complementary", createElementFactory("aside", {})],
	["audio", null, createElementFactory("audio", {})],
	["base", null, createElementFactory("base", {})],
	["blockquote", null, createElementFactory("blockquote", {})],
	["body", null, createElementFactory("body", {})],
	["button", "button", createElementFactory("button", {})],
	["canvas", null, createElementFactory("canvas", {})],
	["caption", null, createElementFactory("caption", {})],
	["col", null, createElementFactory("col", {})],
	["colgroup", null, createElementFactory("colgroup", {})],
	["datalist", "listbox", createElementFactory("datalist", {})],
	["dd", "definition", createElementFactory("dd", {})],
	["del", null, createElementFactory("del", {})],
	["details", "group", createElementFactory("details", {})],
	["dialog", "dialog", createElementFactory("dialog", {})],
	["div", null, createElementFactory("div", {})],
	["dl", null, createElementFactory("dl", {})],
	["dt", "term", createElementFactory("dt", {})],
	["em", null, createElementFactory("em", {})],
	["embed", null, createElementFactory("embed", {})],
	["figcaption", null, createElementFactory("figcaption", {})],
	["fieldset", "group", createElementFactory("fieldset", {})],
  ["figure", "figure", createElementFactory("figure", {})],
  // WARNING: Only in certain context
  ["footer", "contentinfo", createElementFactory("footer", {})],
  // WARNING: only with a name
	["form", "form", createElementFactory("form", {})],
	["h1", "heading", createElementFactory("h1", {})],
	["h2", "heading", createElementFactory("h2", {})],
	["h3", "heading", createElementFactory("h3", {})],
	["h4", "heading", createElementFactory("h4", {})],
	["h5", "heading", createElementFactory("h5", {})],
  ["h6", "heading", createElementFactory("h6", {})],
  // WARNING: Only in certain context
	["header", "banner", createElementFactory("header", {})],
	["hgroup", null, createElementFactory("hgroup", {})],
	["hr", "separator", createElementFactory("hr", {})],
	["html", "document", createElementFactory("html", {})],
	["iframe", null, createElementFactory("iframe", {})],
	["img with alt=\"some text\"", "img", createElementFactory("img", {alt: "text"})],
	["img with missing alt", "img", createElementFactory("img", {})],
	["img with alt=\"\"", "presentation", createElementFactory("img", {alt: ""})],
	["input type=button", "button", createElementFactory("input", {type: "button"})],
	["input type=checkbox", "checkbox", createElementFactory("input", {type: "checkbox"})],
	["input type=color", null, createElementFactory("input", {type: "color"})],
	["input type=date", null, createElementFactory("input", {type: "date"})],
	["input type=datetime-local", null, createElementFactory("input", {type: "datetime-local"})],
	["input type=email", "textbox", createElementFactory("input", {type: "email"})],
	["input type=file", null, createElementFactory("input", {type: "file"})],
	["input type=hidden", null, createElementFactory("input", {type: "hidden"})],
	["input type=image", "button", createElementFactory("input", {type: "image"})],
	["input type=month", null, createElementFactory("input", {type: "month"})],
	["input type=number", "spinbutton", createElementFactory("input", {type: "number"})],
	["input type=radio", "radio", createElementFactory("input", {type: "radio"})],
	["input type=range", "slider", createElementFactory("input", {type: "range"})],
	["input type=reset", "button", createElementFactory("input", {type: "reset"})],
	["input type=search", "searchbox", createElementFactory("input", {type: "search"})],
	["input type=submit", "button", createElementFactory("input", {type: "submit"})],
	["input type=tel", "textbox", createElementFactory("input", {type: "tel"})],
	["input type=text, with no list attribute", "textbox", createElementFactory("input", {type: "text"})],
	["input type=text with a list attribute", "combobox", createElementFactory("input", {list: "",type: "text"})],
	["input type=search with a list attribute", "combobox", createElementFactory("input", {list: "",type: "search"})],
	["input type=tel with a list attribute", "combobox", createElementFactory("input", {list: "",type: "tel"})],
	["input type=url with a list attribute", "combobox", createElementFactory("input", {list: "",type: "url"})],
	["input type=email with a list attribute", "combobox", createElementFactory("input", {list: "",type: "email"})],
	["input type=time", null, createElementFactory("input", {type: "time"})],
	["input type=url", "textbox", createElementFactory("input", {type: "url"})],
	["input type=week", null, createElementFactory("input", {type: "week"})],
	["ins", null, createElementFactory("ins", {})],
	["label", null, createElementFactory("label", {})],
  ["legend", 'legend', createElementFactory("legend", {})],
  // WARNING: Only in certain context
	["li", "listitem", createElementFactory("li", {})],
	["link element with a href", "link", createElementFactory("link", {href: "some"})],
	["main", "main", createElementFactory("main", {})],
	["map", null, createElementFactory("map", {})],
	["math", "math", createElementFactory("math", {})],
	["menu", "list", createElementFactory("menu", {})],
	["meta", null, createElementFactory("meta", {})],
	["meter", null, createElementFactory("meter", {})],
	["nav", "navigation", createElementFactory("nav", {})],
	["noscript", null, createElementFactory("noscript", {})],
	["object", null, createElementFactory("object", {})],
	["ol", "list", createElementFactory("ol", {})],
  ["optgroup", "group", createElementFactory("optgroup", {})],
  // Warning: Only in certain context
	["option", "option", createElementFactory("option", {})],
	["output", "status", createElementFactory("output", {})],
	["p", null, createElementFactory("p", {})],
	["param", null, createElementFactory("param", {})],
	["picture", null, createElementFactory("picture", {})],
	["pre", null, createElementFactory("pre", {})],
	["progress", "progressbar", createElementFactory("progress", {})],
  ["script", null, createElementFactory("script", {})],
  // WARNING: Only with a name
	["section", "region", createElementFactory("section", {})],
	["select, no multiple, no size", "combobox", createElementFactory("select", {})],
	["select, no multiple, no size greater 1", "combobox", createElementFactory("select", {size: 1})],
	["select, size greater 1", "listbox", createElementFactory("select", {size: 2})],
	["select, multiple", "listbox", createElementFactory("select", {multiple: true})],
	["slot", null, createElementFactory("slot", {})],
	["source", null, createElementFactory("source", {})],
	["span", null, createElementFactory("span", {})],
	["strong", null, createElementFactory("strong", {})],
	["style", null, createElementFactory("style", {})],
	["svg", null, createElementFactory("svg", {})],
	["sub", null, createElementFactory("sub", {})],
	["summary", "button", createElementFactory("summary", {})],
	["sup", null, createElementFactory("sup", {})],
	["table", "table", createElementFactory("table", {})],
	["tbody", "rowgroup", createElementFactory("tbody", {})],
	["template", null, createElementFactory("template", {})],
	["textarea", "textbox", createElementFactory("textarea", {})],
	["tfoot", "rowgroup", createElementFactory("tfoot", {})],
	["thead", "rowgroup", createElementFactory("thead", {})],
	["time", null, createElementFactory("time", {})],
  ["title", null, createElementFactory("title", {})],
  // WARNING: Only in certain contexts
	["td", "cell", createElementFactory("td", {})],
	["th", "columnheader", createElementFactory("th", {})],
	["tr", "row", createElementFactory("tr", {})],
	["track", null, createElementFactory("track", {})],
	["ul", "list", createElementFactory("ul", {})],
	["video", null, createElementFactory("video", {})],
	// https://rawgit.com/w3c/aria/stable/#conflict_resolution_presentation_none
	["presentational <img /> with accessible name", "img", createElementFactory("img", {alt: "", 'aria-label': "foo"})],
	["presentational <h1 /> global aria attributes", "heading", createElementFactory("h1", {'aria-describedby': "comment-1", role: "presentation"})],
	["presentational <h1 /> global aria attributes", "heading", createElementFactory("h1", {'aria-describedby': "comment-1", role: "none"})],
	// <div /> isn't mapped to `"generic"` yet so implicit semantics are `No role`
	["presentational <div /> with prohibited aria attributes", null, createElementFactory("div", {'aria-label': "hello", role: "presentation"})],
	["presentational <div /> with prohibited aria attributes", null, createElementFactory("div", {'aria-label': "hello", role: "none"})],
];


describe("implicit roles — https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings", () => {
	it.each(cases)("%s has the role %s (0.6.3)", (name, role, elementFactory) => {
		const element = elementFactory();

		expect(daa06.getRole(element)).toEqual(role);
	});

	// 0.5.16: role="none" is an ordinary explicit role (not a presentation synonym).
	it.each(cases)("%s has the role %s (0.5.16)", (name, role, elementFactory) => {
		const element = elementFactory();
		const expected = element.getAttribute("role") === "none" ? "none" : role;

		expect(getRole(element)).toEqual(expected);
	});
});
