// `pnpm docs:spec`: write docs/spec-coverage.md, an index of every spec section the sources cite
// (the comment links CLAUDE.md asks for on each spec algorithm) and the test files that cite the
// same section. tests/compat/test/docs/spec-coverage.test.ts fails when the committed index is
// out of date.
//
// Inputs, all read from the working tree:
//   - packages/*/src/**/*.ts                      sections implemented (cited in source comments)
//   - packages/*/test/**, tests/compat/test/**    sections tested (doc blocks, describe/test names)
//   - packages/dom/test/wpt/fixtures/**           vendored web-platform-tests: `<link rel="help">`
//                                                 sections, and the fixture directories per area
//   - packages/dom/test/wpt/expectations*.json    known-failing WPT subtests per fixture file

import { globSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SPEC_COVERAGE = fileURLToPath(new URL("../docs/spec-coverage.md", import.meta.url));
const WPT = "packages/dom/test/wpt";
const FIXTURES = `${WPT}/fixtures`;
const FRESHNESS_TEST = "tests/compat/test/docs/spec-coverage.test.ts";

// ---------------------------------------------------------------------------------------------
// URL normalization

export interface Section {
  /** Spec key: a WHATWG shortname ("dom", "html") or "css:cssom", "w3c:accname", "tc39:ecma262", ... */
  spec: string;
  /** Fragment, decoded, without text directives. */
  anchor: string;
}

interface SpecInfo {
  title: string;
  base: string;
}

const WHATWG_TITLES: Record<string, string> = {
  dom: "DOM Standard",
  html: "HTML Standard",
  webidl: "Web IDL",
  infra: "Infra Standard",
  url: "URL Standard",
  xhr: "XMLHttpRequest Standard",
  fetch: "Fetch Standard",
  encoding: "Encoding Standard",
  mimesniff: "MIME Sniffing Standard",
  storage: "Storage Standard",
  websockets: "WebSockets Standard",
  compat: "Compatibility Standard",
  console: "Console Standard",
  streams: "Streams Standard",
  fullscreen: "Fullscreen API Standard",
};

/** W3C shortnames whose TR URLs carry a different name than the editor's draft. */
const W3C_ALIASES: Record<string, string> = { "wai-aria": "aria", "dom-parsing": "DOM-Parsing" };

/** "wai-aria-1.2" → "wai-aria", "selectors4" → "selectors", "css3-selectors" → "selectors". */
function stripLevel(name: string): string {
  return name
    .replace(/^css3-/, "")
    .replace(/-?\d+(\.\d+)*$/, "")
    .replace(/-$/, "");
}

const isCss = (name: string) =>
  /^(css|selectors|mediaqueries|cssom|resize-observer|geometry|filter-effects|compositing)/.test(name);

/**
 * The spec section a URL points at, or null for anything that is not a spec section (no fragment,
 * repositories, MDN, namespace URIs, ...). Multipage and single-page HTML URLs map to the same
 * section, and spec levels (`cssom-1`, `wai-aria-1.2`) to one spec.
 */
export function sectionOf(raw: string): Section | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  let anchor = url.hash.slice(1).split(":~:")[0];
  try {
    anchor = decodeURIComponent(anchor);
  } catch {}
  if (anchor === "") return null;
  const host = url.hostname;
  const path = url.pathname.split("/").filter(Boolean);
  if (host.endsWith(".spec.whatwg.org")) {
    const spec = host.slice(0, -".spec.whatwg.org".length);
    // entities.json and friends are data files, not sections.
    if (
      path.length > 0 &&
      !path[0].endsWith(".html") &&
      path[0] !== "multipage" &&
      path[0] !== "C" &&
      path[0] !== "dev"
    )
      return null;
    return { spec, anchor };
  }
  if (host === "drafts.csswg.org" || host === "drafts.fxtf.org" || host === "drafts.css-houdini.org") {
    if (path.length === 0) return null;
    return { spec: `css:${stripLevel(path[0])}`, anchor };
  }
  if (host === "w3c.github.io" || host === "www.w3.org" || host === "w3.org") {
    let name: string | undefined;
    if (host === "w3c.github.io") name = path[0];
    else if (path[0] === "TR") {
      name = path[1];
      // Dated snapshots: /TR/2013/WD-cssom-20131205/
      if (name && /^\d{4}$/.test(name)) name = path[2]?.replace(/^[A-Z]+-/, "").replace(/-\d{8}$/, "");
    }
    if (!name) return null;
    const short = stripLevel(name);
    if (isCss(short.toLowerCase())) return { spec: `css:${short.toLowerCase()}`, anchor };
    return { spec: `w3c:${W3C_ALIASES[short.toLowerCase()] ?? short}`, anchor };
  }
  if (host === "tc39.es") return path[0] ? { spec: `tc39:${path[0]}`, anchor } : null;
  if (host === "svgwg.org") return { spec: "svg:svg2", anchor };
  if ((host === "httpwg.org" || host === "www.rfc-editor.org") && path[1])
    return { spec: `ietf:${path[1].replace(/\.html$/, "")}`, anchor };
  return null;
}

function specInfo(spec: string): SpecInfo {
  if (!spec.includes(":"))
    return { title: WHATWG_TITLES[spec] ?? `${spec} (WHATWG)`, base: `https://${spec}.spec.whatwg.org/` };
  if (spec.startsWith("css:"))
    return { title: `CSS: ${spec.slice(4)}`, base: `https://drafts.csswg.org/${spec.slice(4)}/` };
  if (spec.startsWith("w3c:"))
    return { title: `W3C: ${spec.slice(4)}`, base: `https://w3c.github.io/${spec.slice(4)}/` };
  if (spec === "svg:svg2") return { title: "SVG 2", base: "https://svgwg.org/svg2-draft/" };
  if (spec.startsWith("ietf:"))
    return { title: spec.slice(5).toUpperCase(), base: `https://httpwg.org/specs/${spec.slice(5)}.html` };
  const name = spec.slice(spec.indexOf(":") + 1);
  return { title: name === "ecma262" ? "ECMAScript" : `TC39: ${name}`, base: `https://tc39.es/${name}/` };
}

// Stop at whitespace, closing brackets, quotes, markdown pipes, template interpolation and commas.
const URL_RE = /https?:\/\/[^\s)\]`"'<>*,{}|\\]+/g;

/** Every spec section cited in `text`, as "spec#anchor" keys. */
export function sectionsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const [m] of text.matchAll(URL_RE)) {
    const s = sectionOf(m.replace(/[.,;:!?]+$/, ""));
    if (s) out.add(`${s.spec}#${s.anchor}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Scanning

const files = (patterns: string[]) =>
  patterns
    .flatMap((p) => globSync(p, { cwd: ROOT, exclude: (f) => f.includes("node_modules") }))
    .map((f) => f.split("\\").join("/"))
    .sort();

/** section key → files citing it */
function index(paths: string[], read: (text: string) => Set<string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const file of paths) {
    for (const key of read(readFileSync(`${ROOT}/${file}`, "utf8"))) {
      let set = out.get(key);
      if (!set) out.set(key, (set = new Set()));
      set.add(file);
    }
  }
  return out;
}

const HELP_RE = /<link\b[^>]*\brel=["']?help["']?[^>]*>/gi;
const HREF_RE = /\bhref=["']?([^"'\s>]+)/i;

function helpLinks(text: string): Set<string> {
  const urls: string[] = [];
  for (const [tag] of text.matchAll(HELP_RE)) {
    const href = tag.match(HREF_RE)?.[1];
    if (href) urls.push(href);
  }
  return sectionsIn(urls.join("\n"));
}

/**
 * Whether some test file hands `fixture` to the WPT harness: its path or its directory appears as a
 * string literal, or its file name does in a test file that also builds paths under its directory
 * (`defineWPT(\`dom/${f}\`)` over a list of names).
 */
function runner(testFiles: string[]): (fixture: string) => boolean {
  const texts = testFiles.map((file) => {
    const text = readFileSync(`${ROOT}/${file}`, "utf8");
    return { text, quoted: new Set(Array.from(text.matchAll(/["'`]([\w./-]+)["'`]/g), (m) => m[1])) };
  });
  return (fixture) => {
    const dir = dirname(fixture);
    const base = fixture.slice(dir.length + 1);
    return texts.some(
      ({ text, quoted }) => quoted.has(fixture) || quoted.has(dir) || (quoted.has(base) && text.includes(`${dir}/`)),
    );
  };
}

interface Scan {
  src: Map<string, Set<string>>;
  tests: Map<string, Set<string>>;
  /** section key → fixture files (relative to the fixtures root) run by some test file */
  wpt: Map<string, Set<string>>;
  fixtures: { file: string; run: boolean }[];
  /** fixture file → known-failing subtests */
  expectations: Map<string, { count: number; source: string }>;
}

function scan(): Scan {
  const srcFiles = files(["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"]);
  // The freshness test cites sample URLs to pin the normalization; it tests no spec section.
  const testFiles = files([
    "packages/*/test/**/*.ts",
    "packages/*/test/**/*.tsx",
    "tests/compat/test/**/*.ts",
    "tests/compat/test/**/*.tsx",
  ]).filter((f) => !f.startsWith(`${FIXTURES}/`) && f !== FRESHNESS_TEST);
  const runs = runner(testFiles);
  const fixtureFiles = files([`${FIXTURES}/**/*.html`, `${FIXTURES}/**/*.htm`, `${FIXTURES}/**/*.js`])
    .map((f) => f.slice(FIXTURES.length + 1))
    // .js files are tests only as WPT's `.any.js` / `.window.js`; the rest are helpers.
    .filter(
      (f) =>
        !/(^|\/)(resources|support|common|scripts)\//.test(f) &&
        !/-iframe\.html$|Frame\.htm$/.test(f) &&
        (!f.endsWith(".js") || /\.(any|window)\.js$/.test(f)),
    );
  const fixtures = fixtureFiles.map((file) => ({ file, run: runs(file) }));
  const run = fixtures.filter((f) => f.run).map((f) => f.file);
  const wpt = new Map<string, Set<string>>();
  for (const file of run) {
    for (const key of helpLinks(readFileSync(`${ROOT}/${FIXTURES}/${file}`, "utf8"))) {
      let set = wpt.get(key);
      if (!set) wpt.set(key, (set = new Set()));
      set.add(file);
    }
  }
  const expectations = new Map<string, { count: number; source: string }>();
  for (const source of files([`${WPT}/expectations.json`, `${WPT}/expectations/*.json`])) {
    const data = JSON.parse(readFileSync(`${ROOT}/${source}`, "utf8")) as Record<string, string[]>;
    for (const [file, subtests] of Object.entries(data))
      expectations.set(file, { count: subtests.length, source: relative(WPT, source) });
  }
  return { src: index(srcFiles, sectionsIn), tests: index(testFiles, sectionsIn), wpt, fixtures, expectations };
}

// ---------------------------------------------------------------------------------------------
// Rendering

/** packages/dom/src/nodes/tree.ts → dom/nodes/tree.ts; tests/compat/test/x.test.ts → compat/x.test.ts */
const short = (file: string) =>
  file.replace(/^packages\/([^/]+)\/(src|test)\//, "$1/").replace(/^tests\/compat\/test\//, "compat/");

function list(items: string[], max: number): string {
  const shown = items
    .slice(0, max)
    .map((i) => `\`${i}\``)
    .join(", ");
  return items.length > max ? `${shown} +${items.length - max}` : shown;
}

export interface SpecSummary {
  spec: string;
  title: string;
  implemented: number;
  tested: number;
  wptOnly: number;
  untested: number;
}

export function summarize(s: Scan = scan()): SpecSummary[] {
  const bySpec = new Map<string, SpecSummary>();
  for (const key of s.src.keys()) {
    const spec = key.slice(0, key.indexOf("#"));
    let row = bySpec.get(spec);
    if (!row)
      bySpec.set(
        spec,
        (row = { spec, title: specInfo(spec).title, implemented: 0, tested: 0, wptOnly: 0, untested: 0 }),
      );
    row.implemented++;
    if (s.tests.has(key)) row.tested++;
    else if (s.wpt.has(key)) row.wptOnly++;
    else row.untested++;
  }
  // Most-cited specs first, then by key.
  return [...bySpec.values()].sort((a, b) => b.implemented - a.implemented || a.spec.localeCompare(b.spec));
}

export function renderSpecCoverage(s: Scan = scan()): string {
  const summary = summarize(s);
  const out: string[] = [];
  const total = (k: keyof SpecSummary) => summary.reduce((n, r) => n + (r[k] as number), 0);
  out.push(
    "# Spec coverage",
    "",
    "<!-- Generated by `pnpm docs:spec` (scripts/spec-coverage.ts). Do not edit by hand: tests/compat/test/docs/spec-coverage.test.ts fails when this file is stale. -->",
    "",
    "Every spec section the sources cite, and the tests that cite the same section. Generated from the",
    "working tree:",
    "",
    "- **Implemented**: a section URL appears in a comment under `packages/*/src` (CLAUDE.md asks for a link",
    "  on every spec algorithm, so this is the list of algorithms we claim to implement).",
    "- **Tests**: test files under `packages/*/test` and `tests/compat/test` whose doc block, `describe` or",
    "  test names cite that section URL.",
    '- **WPT**: vendored web-platform-tests fixtures whose `<link rel="help">` names the section, counted',
    "  only for fixtures a test file runs (its path or directory is passed to the WPT harness).",
    "- **untested**: implemented, but cited by no test file and no running WPT fixture. The test may still",
    "  exist without the link; adding the section URL to its `describe` makes it show up here.",
    "",
    "URLs are normalized before matching: multipage and single-page HTML Standard URLs are the same",
    "section, spec levels collapse (`cssom-1`, `www.w3.org/TR/cssom-1` and `drafts.csswg.org/cssom` are one",
    "spec, `wai-aria-1.2` is `aria`), and links without a fragment are ignored. Sections are sorted by anchor.",
    "",
    "## Summary",
    "",
    "| Spec | Implemented | Tested | WPT only | Untested |",
    "| --- | --: | --: | --: | --: |",
  );
  for (const r of summary)
    out.push(`| [${r.title}](#${slug(r.title)}) | ${r.implemented} | ${r.tested} | ${r.wptOnly} | ${r.untested} |`);
  out.push(
    `| **All** | ${total("implemented")} | ${total("tested")} | ${total("wptOnly")} | ${total("untested")} |`,
    "",
  );

  // WPT fixture directories.
  const dirs = new Map<string, { files: number; run: number; failing: number; sources: Set<string> }>();
  for (const f of s.fixtures) {
    // At most two levels deep: `dom/nodes`, `html/semantics`.
    const key = dirname(f.file).split("/").slice(0, 2).join("/");
    let row = dirs.get(key);
    if (!row) dirs.set(key, (row = { files: 0, run: 0, failing: 0, sources: new Set() }));
    row.files++;
    if (f.run) row.run++;
    const e = s.expectations.get(f.file);
    if (e) {
      row.failing += e.count;
      row.sources.add(e.source);
    }
  }
  out.push(
    "## Web-platform-tests fixtures",
    "",
    `Vendored under \`${FIXTURES}\` (see its README.md). "Run" counts the files a test file hands to the`,
    "harness by path or by directory; known-failing subtests are listed with reasons in",
    `\`${WPT}/expectations.json\` and \`${WPT}/expectations/*.json\`.`,
    "",
    "| Directory | Test files | Run | Known-failing subtests | Expectation files |",
    "| --- | --: | --: | --: | --- |",
  );
  for (const [dir, r] of [...dirs].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(
      `| \`${dir}\` | ${r.files} | ${r.run} | ${r.failing} | ${[...r.sources]
        .sort()
        .map((x) => `\`${x}\``)
        .join(", ")} |`,
    );
  }
  out.push("");

  // Per spec tables.
  for (const r of summary) {
    const info = specInfo(r.spec);
    out.push(
      `## ${r.title}`,
      "",
      `<${info.base}> — ${r.implemented} sections implemented, ${r.tested} tested, ${r.wptOnly} by WPT only, ${r.untested} untested.`,
      "",
      "| Section | Implemented in | Tests |",
      "| --- | --- | --- |",
    );
    const keys = [...s.src.keys()]
      .filter((k) => k.startsWith(`${r.spec}#`))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const key of keys) {
      const anchor = key.slice(r.spec.length + 1);
      const tests = [...(s.tests.get(key) ?? [])].map(short);
      const wpt = [...(s.wpt.get(key) ?? [])];
      const cells = [tests.length ? list(tests, 4) : "", wpt.length ? `WPT: ${list(wpt, 2)}` : ""]
        .filter(Boolean)
        .join("; ");
      out.push(
        `| [${anchor.replaceAll("|", "\\|")}](${info.base}#${encodeURI(anchor)}) | ${list([...s.src.get(key)!].map(short), 3)} | ${cells || "**untested**"} |`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}

/** GitHub's heading anchor for `title`. */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .replaceAll(" ", "-");
}

if (import.meta.main) {
  const s = scan();
  writeFileSync(SPEC_COVERAGE, renderSpecCoverage(s));
  console.log("docs/spec-coverage.md updated\n");
  console.log("spec                     implemented  tested  wpt-only  untested");
  for (const r of summarize(s)) {
    console.log(
      `${r.spec.padEnd(24)} ${String(r.implemented).padStart(11)} ${String(r.tested).padStart(7)} ${String(r.wptOnly).padStart(9)} ${String(r.untested).padStart(9)}`,
    );
  }
}
