// Differential fixtures: markup evaluated by the upstream oracle on jsdom and by
// @ctrl/dom/aria on @ctrl/dom. Markup is written fully explicit (tbody, closing tags, no
// self-closing non-void elements) so both parsers build identical trees.

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Fixture {
  name: string;
  html: string;
  /** Runs against the document after parsing (public DOM API only), on both engines. */
  setup?: (doc: any) => void;
}

export const fixtures: Fixture[] = [
  {
    name: "form controls with labels",
    html: `
<form aria-label="Sign up">
  <label for="first">First <b>name</b></label><input id="first" type="text" value="Ada">
  <label>Last name <input type="text" name="last" value="Lovelace"></label>
  <label for="email">Email</label><input id="email" type="email" placeholder="you@example.com">
  <label for="pw">Password</label><input id="pw" type="password">
  <input type="search" aria-label="Search site">
  <input type="tel" title="Phone number">
  <input type="url" list="urls"><datalist id="urls"><option value="https://a.example">A</option></datalist>
  <input type="number" aria-label="Quantity" value="3">
  <input type="range" aria-label="Volume" min="0" max="11" value="7">
  <input type="checkbox" id="tos"><label for="tos">I agree to the <a href="/tos">terms</a></label>
  <input type="radio" name="plan" id="p1" checked><label for="p1">Free</label>
  <input type="radio" name="plan" id="p2"><label for="p2">Pro</label>
  <input type="hidden" name="csrf" value="x">
  <input type="date" aria-label="Birthday">
  <input type="color"><input type="file"><input type="month"><input type="time"><input type="week">
  <input type="datetime-local"><input type="foo"><input type="TEXT"><input type="Checkbox">
  <input type="submit"><input type="submit" value="Send"><input type="reset"><input type="button" value="Click">
  <input type="image" alt="Go"><input type="image"><input type="image" title="Search image">
  <textarea aria-label="Bio">Hello</textarea>
  <label for="ta">Notes</label><textarea id="ta"></textarea>
  <select aria-label="Country"><option>NL</option><option selected>DE</option></select>
  <select multiple aria-label="Toppings"><option selected>Cheese</option><option>Ham</option><option selected>Olives</option></select>
  <select size="3"><option>a</option></select><select size="1"><option>b</option></select><select size=""><option>c</option></select>
  <fieldset><legend>Shipping <em>address</em></legend><input aria-label="Street"></fieldset>
  <fieldset><input></fieldset>
  <button type="submit">Create <span>account</span></button>
  <button aria-label="Close">×</button>
  <button title="Only title"></button>
  <button><img src="x.png" alt="Save"></button>
  <button><svg><title>Delete</title></svg></button>
  <output for="first">Result</output>
  <meter value="0.5" aria-label="Disk"></meter><progress value="20" max="100"></progress>
</form>`,
  },
  {
    name: "inputs with list attribute (combobox) and empty attributes",
    html: `
<input list="l"><input list=""><input type="text" list="l"><input type="email" list=""><input type="search" list="l">
<input type="tel" list="l"><input type="url" list=""><input type="number" list="l"><input type="checkbox" list="l">
<input type="foo" list="l"><input type="foo" list="">
<datalist id="l"><option value="1"></option></datalist>
<form name=""></form><form name="f"></form><form aria-label=""></form><form aria-labelledby="h"></form><form></form>
<section aria-label=""></section><section aria-label="Named"></section><section aria-labelledby="h"></section><section></section>
<h1 id="h">Heading</h1>
<a>no href</a><a href="">empty href</a><a href="#x">link</a><area href="/x" alt="Area"><area alt="No href">
<img alt=""><img alt="Pic"><img><img alt="" aria-label="Labelled"><img alt="" role="presentation" aria-label="x">
<img alt="" aria-describedby="h">`,
  },
  {
    name: "landmarks",
    html: `
<header>Site header</header>
<nav aria-label="Primary"><ul><li><a href="/">Home</a></li><li><a href="/about" aria-current="page">About</a></li></ul></nav>
<main>
  <article><header><h2>Post</h2></header><p>Body <strong>text</strong> <em>here</em>.</p><footer>Post footer</footer></article>
  <aside aria-label="Related">Related</aside>
  <section aria-labelledby="sh"><h3 id="sh">Section title</h3></section>
  <search><form aria-label="Find"><input type="search"></form></search>
</main>
<aside>Sidebar</aside>
<footer>Site footer <address>Contact</address></footer>
<div role="banner">Explicit banner</div><div role="contentinfo">Explicit footer</div>
<div role="region" aria-label="Explicit region">x</div>`,
  },
  {
    name: "tables and grids",
    html: `
<table>
  <caption>Quarterly <b>results</b></caption>
  <thead><tr><th>Name</th><th scope="col">Q1</th><th scope="COLGROUP">Q2</th></tr></thead>
  <tbody>
    <tr><th scope="row">Widgets</th><td>1</td><td>2</td></tr>
    <tr><th scope="rowgroup">Gadgets</th><td headers="x">3</td><td>4</td></tr>
  </tbody>
  <tfoot><tr><td>Total</td><td>4</td><td>6</td></tr></tfoot>
</table>
<table aria-label="Labelled table"><tbody><tr><td>a</td></tr></tbody></table>
<table role="grid"><tbody><tr role="row"><td role="gridcell" aria-selected="true">g1</td><td role="gridcell" aria-selected="false">g2</td></tr></tbody></table>
<div role="table" aria-label="ARIA table"><div role="rowgroup"><div role="row"><span role="columnheader">H</span><span role="cell">C</span></div></div></div>
<table><tbody><tr hidden><td>hidden row</td></tr><tr><td style="display:none">hidden cell</td><td>shown</td></tr></tbody></table>`,
  },
  {
    name: "menus, tabs, dialogs and other widgets",
    html: `
<button aria-haspopup="menu" aria-expanded="true" aria-controls="m" id="mb">Actions</button>
<ul role="menu" id="m" aria-labelledby="mb">
  <li role="menuitem">Edit</li>
  <li role="menuitemcheckbox" aria-checked="true">Bold</li>
  <li role="menuitemcheckbox" aria-checked="mixed">Italic</li>
  <li role="menuitemradio" aria-checked="false">Left</li>
  <li role="separator"></li>
  <li role="menuitem" aria-disabled="true">Delete</li>
</ul>
<div role="menubar"><div role="menuitem" aria-expanded="false">File</div></div>
<div role="tablist" aria-label="Tabs">
  <button role="tab" aria-selected="true" aria-controls="p1" id="t1">One</button>
  <button role="tab" aria-selected="false" id="t2">Two</button>
</div>
<div role="tabpanel" id="p1" aria-labelledby="t1">Panel one</div>
<dialog open aria-labelledby="dt"><h2 id="dt">Confirm</h2><p id="dd">Are you sure?</p><button>OK</button></dialog>
<dialog aria-label="Closed dialog"><button>Hidden</button></dialog>
<div role="dialog" aria-modal="true" aria-describedby="dd" aria-label="Custom">x</div>
<div role="alertdialog" aria-labelledby="dd">y</div>
<div role="switch" aria-checked="true" tabindex="0">Wifi</div>
<div role="checkbox" aria-checked="mixed">Some</div>
<button aria-pressed="true">Bold</button><button aria-pressed="mixed">Mixed</button><button aria-pressed="false">Off</button>
<div role="slider" aria-valuenow="5" aria-valuemin="0" aria-valuemax="10" aria-valuetext="five" aria-label="S"></div>
<div role="spinbutton" aria-valuenow="abc" aria-label="Spin"></div>
<div role="progressbar" aria-valuenow="50"></div>
<div role="scrollbar" aria-valuenow="1" aria-controls="m"></div>
<div role="tree"><div role="treeitem" aria-expanded="true" aria-level="1" aria-selected="true">Root<div role="group"><div role="treeitem" aria-level="2">Leaf</div></div></div></div>
<div role="listbox" aria-label="Fruits" aria-busy="true"><div role="option" aria-selected="true">Apple</div><div role="option">Pear</div></div>
<div role="combobox" aria-expanded="false" aria-label="Pick"><input aria-label="Inner"></div>
<div role="heading" aria-level="4">Level four</div><div role="heading">No level</div>
<h3 aria-level="5">Overridden</h3><h2 aria-level="">Empty level</h2><h4 aria-level="abc">NaN level</h4><h6 aria-level="0">Zero</h6>
<div role="alert">Saved</div><div role="status">Idle</div><div role="log"></div><div role="marquee"></div><div role="timer"></div>
<div role="tooltip" id="tt">Help text</div><button aria-describedby="tt">?</button>
<div role="toolbar" aria-label="Formatting"><button>B</button></div>
<div role="feed"></div><div role="math"></div><div role="note">n</div><div role="definition">d</div><div role="term">t</div>
<div role="img" aria-label="Chart"></div><div role="figure" aria-labelledby="dd"></div><div role="group" aria-label="G"></div>
<div role="radiogroup" aria-label="RG"><div role="radio" aria-checked="true">R1</div><div role="radio">R2</div></div>
<div role="link" aria-current="true">Current</div><div aria-current="false">Not current</div><div aria-current="step">Step</div>
<div role="searchbox" aria-label="Find"></div><div role="textbox" contenteditable="true">Editable text</div>
<div role="presentation">Presentational</div><div role="none">None</div><span role="none presentation">Both</span>
<div role="button link">Fallback roles</div><div role=" button">Leading space</div><div role="">Empty role</div>
<div role="BUTTON">Uppercase role</div><div role="doc-chapter">Chapter</div><div role="unknownrole">Unknown</div>`,
  },
  {
    name: "hidden subtrees",
    html: `
<div hidden><button>Hidden by attribute</button></div>
<div aria-hidden="true"><button>Hidden by aria</button><span id="ah">aria hidden text</span></div>
<div aria-hidden="false"><button>Visible aria false</button></div>
<div style="display: none"><button>Display none</button><span id="dn">display none text</span></div>
<div style="visibility: hidden"><button>Visibility hidden</button><button style="visibility: visible">Visible again</button></div>
<div style="visibility:hidden !important; visibility: visible"><a href="#">important wins</a></div>
<div style="display:block;display:none"><a href="#">last wins</a></div>
<div style="display: inherit"><a href="#">inherit display</a></div>
<button aria-labelledby="ah dn">Refs hidden</button>
<button aria-describedby="dn">Desc hidden</button>
<button>Visible <span hidden>secret</span><span aria-hidden="true">icon</span><span style="display:none">gone</span>text</button>
<label for="hi">Hidden <span style="visibility:hidden">x</span>label</label><input id="hi">
<p hidden="until-found">until found</p>
<input type="hidden" aria-label="hidden input">
<embed hidden>
<details><summary>More</summary><p>Details body</p></details>
<details open><summary>Open</summary><p>Open body</p></details>
<div popover>Popover content <button>In popover</button></div>
<template><button>In template</button></template>
<noscript><button>noscript</button></noscript>`,
  },
  {
    name: "name from content and child separators",
    html: `
<button><div>block</div><div>children</div></button>
<button><span>inline</span><span>children</span></button>
<a href="#"><p>Para</p><span>after</span></a>
<h2>Heading <code>code</code> <kbd>kbd</kbd> and <abbr title="abbreviation">abbr</abbr></h2>
<h2><img alt="Logo"> Company</h2>
<h2><img alt=""> Empty alt</h2>
<button>  lots   of
   whitespace  </button>
<a href="#"><span aria-label="Labelled span">ignored</span></a>
<a href="#" aria-label="  ">Blank aria-label</a>
<a href="#" title="Link title"></a>
<div role="link" title="Div title"></div>
<li role="option" title="opt title">Option text</li>
<button><span role="presentation">pres</span><span role="img" aria-label="img"></span></button>
<button>Before<br>after</button>
<td>outside table</td>
<div role="row"><span role="cell">c1</span><span role="cell">c2</span></div>
<label id="lab">Labelled <input type="checkbox"> by</label>
<button aria-labelledby="lab self" id="self">Self</button>
<div id="ref1">Ref <span id="ref2">nested</span></div><button aria-labelledby="ref1 ref2 missing">X</button>
<button aria-labelledby="">Empty labelledby</button>
<button aria-labelledby="  ref2  ">Spaces labelledby</button>
<input aria-labelledby="ref2" aria-label="ignored" id="iii">
<h2 id="h2c">Country: <select><option>Spain</option><option selected>France</option></select></h2><button aria-labelledby="h2c">c</button>
<h2 id="h2t">Name: <input value="Bob"> <textarea>Long</textarea></h2><button aria-labelledby="h2t">t</button>
<h2 id="h2r">Volume <input type="range" value="5"> <div role="slider" aria-valuenow="9"></div> <div role="spinbutton" aria-valuetext="lots"></div></h2><button aria-labelledby="h2r">r</button>
<div id="lb" role="listbox"><div role="option" aria-selected="true">Sel1</div><div role="option" aria-selected="true">Sel2</div></div><button aria-labelledby="lb">lb</button>
<div id="owner" aria-owns="owned">Owner</div><span id="owned">owned text</span><button aria-labelledby="owner">o</button>
<svg aria-label="SVG label"></svg><svg><title>SVG title</title><desc>desc</desc></svg>
<svg><a href="#"><text>svg link</text></a></svg>
<math><mi>x</mi></math>`,
  },
  {
    name: "dynamic form state",
    html: `
<input id="cb1" type="checkbox"><input id="cb2" type="checkbox" checked><input id="cb3" type="checkbox">
<input id="r1" type="radio" name="g"><input id="txt" type="text" value="initial">
<select id="sel"><option id="o1">One</option><option id="o2">Two</option></select>
<select id="msel" multiple><option id="m1" selected>A</option><option id="m2">B</option></select>
<select id="dsel"><option disabled>Disabled first</option><option>Second</option></select>
<label>Typed <input id="typed" value="before"></label>
<button aria-labelledby="sel">pick</button>`,
    setup(doc) {
      doc.getElementById("cb1").checked = true;
      doc.getElementById("cb2").checked = false;
      doc.getElementById("cb3").indeterminate = true;
      doc.getElementById("txt").value = "changed";
      doc.getElementById("o2").selected = true;
      doc.getElementById("typed").value = "after";
    },
  },
  {
    name: "disabled and misc states",
    html: `
<button disabled>Disabled</button><button aria-disabled="true">Aria disabled</button>
<fieldset disabled><input aria-label="in disabled fieldset"></fieldset>
<select disabled><optgroup label="Group" disabled><option disabled>o</option></optgroup></select>
<textarea disabled></textarea><div disabled>div disabled</div><a href="#" aria-disabled="true">l</a>
<div aria-busy="true">busy</div><div aria-busy="false">not busy</div>
<div aria-expanded="true">exp</div><div aria-expanded="TRUE">exp upper</div>
<div aria-selected="true" role="tab">sel</div><div aria-checked="true" role="checkbox">chk</div>
<div aria-pressed="true" role="button">p</div><input type="checkbox" aria-checked="false" checked>
<option selected>loose option</option>
<div role="slider" aria-valuemin="1" aria-valuemax="9" aria-valuenow=" 5 " aria-valuetext=""></div>`,
  },
  {
    name: "lists, definition lists and misc semantics",
    html: `
<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol><menu><li>Cmd</li></menu>
<li>orphan li</li>
<dl><dt>Term</dt><dd>Definition</dd></dl><dfn>dfn</dfn>
<blockquote>Quote</blockquote><q>inline quote</q><pre>pre</pre><code>c</code><samp>s</samp>
<del>deleted</del><ins>inserted</ins><mark>marked</mark><sub>2</sub><sup>3</sup><small>small</small>
<b>b</b><i>i</i><u>u</u><bdo dir="rtl">bdo</bdo><data value="1">data</data><time>now</time>
<hr><figure><img src="a.png" alt="Fig"><figcaption>Caption</figcaption></figure>
<hgroup><h1>Title</h1><p>Subtitle</p></hgroup>
<optgroup label="Loose group"></optgroup>
<p>Paragraph</p><span>span</span><div>div</div><custom-element>custom</custom-element>
<label>Bare label</label><legend>Bare legend</legend><summary>Bare summary</summary>
<iframe title="Frame"></iframe><video></video><audio></audio><canvas></canvas><object></object><picture></picture>
<link href="/x"><abbr>abbr</abbr><cite>cite</cite><var>v</var><kbd>k</kbd><s>s</s><ruby>r<rt>t</rt></ruby><wbr><br>`,
  },
];

fixtures.push(
  {
    name: "inline-block form controls as name-from-content children (separators)",
    html: `
<label for="s1">a<select><option selected>b</option></select>c<textarea>d</textarea>e<meter value="1">m</meter>f<progress>p</progress>g</label><input type="checkbox" id="s1">
<button>x<span style="display:inline-block">y</span>z<span style="display:block">w</span></button>
<div id="lbx" role="listbox"><div role="option" aria-selected="true">o<optgroup label="g"></optgroup>p</div></div><button aria-labelledby="lbx">l</button>`,
  },
  {
    name: "author style sheets",
    html: `
<style>
  .gone { display: none } .ghost { visibility: hidden } .shown { display: block }
  .blk { display: block } .inl { display: inline } #styled > span { display: none }
  [data-x="1"] { visibility: hidden } button.pseudo::before { content: "icon " }
  .rev { visibility: visible }
</style>
<button>Visible <span class="gone">gone</span><span class="ghost">ghost</span> text</button>
<div class="ghost"><button>ghost button</button><button class="rev">revealed</button></div>
<div class="gone"><a href="#">in gone</a></div>
<div hidden class="shown"><a href="#">hidden attr but display block</a></div>
<p id="styled"><span>x</span><b>bold</b></p>
<button><span class="blk">block</span><span>inline</span><div class="inl">div inline</div>end</button>
<button data-x="1">attr hidden</button>
<button class="pseudo">with pseudo</button>
<label for="l1">Field <span class="gone">secret</span>name</label><input id="l1">`,
  },
);

// Combinatorial fixtures: every element name aria-query / dom-accessibility-api know about,
// crossed with the attributes their role tables branch on.
const TAGS = [
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "blockquote", "button",
  "canvas", "caption", "cite", "code", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div",
  "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
  "h5", "h6", "header", "hgroup", "hr", "i", "iframe", "img", "input", "ins", "kbd", "label", "legend",
  "li", "main", "mark", "menu", "meter", "nav", "object", "ol", "optgroup", "option", "output", "p",
  "picture", "pre", "progress", "q", "s", "samp", "search", "section", "select", "slot", "small", "span",
  "strong", "sub", "summary", "sup", "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "time",
  "tr", "u", "ul", "var", "video", "custom-el",
];
const VOID = new Set(["area", "embed", "hr", "img", "input"]);
const ATTR_SETS = [
  "",
  'role="presentation"',
  'role="none" aria-describedby="lbl"',
  'role="presentation" aria-label="x"',
  'href="#"',
  'href=""',
  'alt=""',
  'alt="Alt" title="T"',
  'aria-label="Label"',
  'aria-labelledby="lbl"',
  'aria-label=""',
  'name="n"',
  'scope="row"',
  'scope="col"',
  'type="text" list="lbl"',
  'type="search"',
  'type="number" value="3"',
  'multiple',
  'size="4"',
  'size="1"',
  'hidden',
  'aria-hidden="true"',
  'style="display:none"',
  'disabled',
  'title="Title only"',
];
export const comboFixtures: Fixture[] = ATTR_SETS.map((attrs) => ({
  name: `all elements with [${attrs || "no attributes"}]`,
  html:
    '<span id="lbl">Label from id</span>' +
    TAGS.map((t) => (VOID.has(t) ? `<${t} ${attrs}>` : `<div><${t} ${attrs}>Text ${t}</${t}></div>`)).join(""),
}));
