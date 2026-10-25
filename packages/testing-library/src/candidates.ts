// "Closest matches" for failed queries under agent mode (CTRL_DOM_DEBUG, ./agent-debug.ts).
// Not part of upstream @testing-library/dom.
//
// The usual fix for a failing `getByRole("button", { name: "Submit" })` is one of: the name is
// different ("Save"), the role is different (a link, or a `<div>` with no role), the element is
// hidden from the accessibility tree, or a state filter does not match. These helpers list such
// elements in aria snapshot syntax with a `# reason` comment, best guesses first.
//
// Roles, names and hiddenness use the same @ctrl/dom/aria functions ByRole uses (html-aam roles,
// https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings; accname,
// https://w3c.github.io/accname/#mapping_additional_nd_name).

import { ELEMENT_NODE, attr, nextInTree, type NodeImpl } from "@ctrl/dom/internal";
import { computeAccessibleNameImpl, isInaccessibleImpl, tlRole, tlRoleMatches } from "@ctrl/dom/aria/internal";
import {
  describeElement,
  hiddenReason,
  nodeKey,
  nodeProps,
  quote,
  truncate,
  type SnapshotNode,
} from "./aria-snapshot.ts";
import { getNodeTextImpl } from "./get-node-text.ts";
import { implOf } from "./helpers.ts";
import { fuzzyMatches, matches, type Matcher, type NormalizerFn } from "./matches.ts";
import { matchesSelector } from "./selectors.ts";

const MAX_CANDIDATES = 10;
const MAX_TEXT = 80;
const PRESENTATIONAL = new Set(["", "generic", "none", "presentation"]);
const identity = (text: string) => text;

interface Candidate {
  line: string;
  /** lower is better */
  rank: number;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Loose similarity for string matchers: 0 = equal ignoring case/space, 1 = substring, 2 = shares a word, -1 = unrelated. */
function similarity(candidate: string, wanted: string): number {
  const a = normalize(candidate).toLowerCase();
  const b = normalize(wanted).toLowerCase();
  if (a === "" || b === "") return -1;
  if (a === b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const words = b.split(" ");
  for (let i = 0; i < words.length; i++) if (words[i].length > 2 && a.includes(words[i])) return 2;
  return -1;
}

/** Whether `text` matches `matcher` exactly, or loosely for string matchers (rank), or not at all (-1). */
function closeness(text: string, node: any, matcher: Matcher, normalizer: NormalizerFn, exact = true): number {
  if ((exact ? matches : fuzzyMatches)(text, node, matcher, normalizer)) return 0;
  if (typeof matcher === "string" || typeof matcher === "number") {
    const s = similarity(normalizer(text), String(matcher));
    return s === -1 ? -1 : s + 1;
  }
  return -1;
}

function line(el: NodeImpl, role: string, name: string, hidden: boolean, comment: string): string {
  const node: SnapshotNode = {
    role,
    name,
    props: nodeProps(el, role, false, hidden),
    value: null,
    url: null,
    children: [],
    element: el,
  };
  return `- ${nodeKey(node, MAX_TEXT)}  # ${comment}`;
}

function format(title: string, candidates: Candidate[]): string {
  if (candidates.length === 0) return "";
  candidates.sort((a, b) => a.rank - b.rank);
  const shown = candidates.slice(0, MAX_CANDIDATES).map((c) => c.line);
  if (candidates.length > MAX_CANDIDATES) shown.push(`# … ${candidates.length - MAX_CANDIDATES} more`);
  return `${title}:\n${shown.join("\n")}`;
}

function nameOf(el: NodeImpl): string {
  return normalize(computeAccessibleNameImpl(el, undefined, 5));
}

export interface RoleCandidateQuery {
  role: string;
  name: Matcher | ((name: string, element: any) => boolean) | undefined;
  hidden: boolean;
  queryFallbacks: boolean;
  /** ByRole's state filter (checked, pressed, level, …) for one element */
  matchesState: (el: NodeImpl) => boolean;
  /** e.g. `{ pressed: true }`, for the comment on state mismatches */
  stateHint: string;
}

/** Closest elements for a failed `*ByRole` query, or "". */
export function roleCandidates(container: any, q: RoleCandidateQuery): string {
  const root = implOf(container);
  const out: Candidate[] = [];
  const name = q.name as Matcher | undefined;
  for (let el = root.first; el !== null; el = nextInTree(el, root)) {
    if (el.type !== ELEMENT_NODE) continue;
    const inaccessible = isInaccessibleImpl(el);
    const role = tlRole(el);
    if (tlRoleMatches(el, q.role, q.queryFallbacks)) {
      const elName = nameOf(el);
      const nameRank = name === undefined ? 0 : closeness(elName, el.node, name, identity);
      const stateOk = q.matchesState(el);
      if (nameRank === 0 && stateOk) {
        if (inaccessible && !q.hidden)
          out.push({
            line: line(el, role, elName, true, `hidden: ${hiddenReason(el)} (or pass { hidden: true })`),
            rank: 0,
          });
      } else if (nameRank === 0) {
        out.push({
          line: line(el, role, elName, inaccessible && !q.hidden, `role and name match, state is not ${q.stateHint}`),
          rank: 1,
        });
      } else if (!inaccessible || q.hidden) {
        out.push({
          line: line(el, role, elName, false, nameRank > 0 ? "similar name" : "same role, other name"),
          rank: nameRank > 0 ? 2 + nameRank : 10,
        });
      }
      continue;
    }
    if (name === undefined) continue;
    if (!PRESENTATIONAL.has(role)) {
      const elName = nameOf(el);
      if (elName === "") continue;
      const rank = closeness(elName, el.node, name, identity);
      if (rank >= 0)
        out.push({
          line: line(el, role, elName, inaccessible && !q.hidden, `same name, role "${role}"`),
          rank: 2 + rank,
        });
      continue;
    }
    // `<div onClick>Submit</div>`: text that would be the name, on an element with no role.
    const text = normalize(getNodeTextImpl(el));
    if (text !== "" && closeness(text, el.node, name, identity) === 0) {
      out.push({
        line: `- text: ${quote(truncate(text, MAX_TEXT))}  # in ${describeElement(el)}, which has no role: give it role="${q.role}" or use getByText`,
        rank: 2,
      });
    }
  }
  return format("Closest matches", out);
}

function roleOrTag(el: NodeImpl): string {
  const role = tlRole(el);
  return PRESENTATIONAL.has(role) ? describeElement(el) : role;
}

/** Closest elements for a failed `*ByText` query, or "". */
export function textCandidates(
  container: any,
  text: Matcher,
  normalizer: NormalizerFn,
  selector: string,
  ignore: string | boolean,
  exact: boolean,
): string {
  if (typeof text === "function") return "";
  const root = implOf(container);
  const out: Candidate[] = [];
  // Elements whose whole text content matches although no single text node does: text split
  // by child elements (`Hello <b>world</b>`). Keep the deepest such elements only.
  const split: NodeImpl[] = [];
  for (let el = root.first; el !== null; el = nextInTree(el, root)) {
    if (el.type !== ELEMENT_NODE) continue;
    if (ignore && typeof ignore === "string" && matchesSelector(el, ignore)) continue;
    const own = getNodeTextImpl(el);
    const rank = own.trim() === "" ? -1 : closeness(own, el.node, text, normalizer, exact);
    if (rank === 0) {
      // The text matches but the `selector` option excluded the element.
      out.push({
        line: `- ${roleOrTag(el)}: ${quote(truncate(normalizer(own), MAX_TEXT))}  # matches, but not selector "${selector}"`,
        rank: 0,
      });
    } else if (rank > 0) {
      out.push({
        line: `- ${roleOrTag(el)}: ${quote(truncate(normalizer(own), MAX_TEXT))}  # similar text in ${describeElement(el)}`,
        rank: 1 + rank,
      });
    }
    if (
      rank !== 0 &&
      el.first !== null &&
      el.first !== el.last &&
      (exact ? matches : fuzzyMatches)((el.node as any).textContent, el.node, text, normalizer)
    )
      split.push(el);
  }
  for (let i = 0; i < split.length; i++) {
    const el = split[i];
    let hasDeeper = false;
    for (let j = i + 1; j < split.length && !hasDeeper; j++) if (isAncestor(el, split[j])) hasDeeper = true;
    if (hasDeeper) continue;
    out.push({
      line: `- ${roleOrTag(el)}: ${quote(truncate(normalizer((el.node as any).textContent), MAX_TEXT))}  # text split across child elements of ${describeElement(el)}: use a function matcher or getByRole`,
      rank: 0,
    });
  }
  return format("Closest matches", out);
}

function isAncestor(a: NodeImpl, b: NodeImpl): boolean {
  for (let p = b.parent; p !== null; p = p.parent) if (p === a) return true;
  return false;
}

const LABELLABLE_ROLES = new Set([
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
]);

/** Form controls and their accessible names for a failed `*ByLabelText` query, or "". */
export function labelCandidates(container: any, text: Matcher, normalizer: NormalizerFn, exact: boolean): string {
  if (typeof text === "function") return "";
  const root = implOf(container);
  const out: Candidate[] = [];
  for (let el = root.first; el !== null; el = nextInTree(el, root)) {
    if (el.type !== ELEMENT_NODE) continue;
    const role = tlRole(el);
    if (!LABELLABLE_ROLES.has(role)) continue;
    const name = nameOf(el);
    const hidden = isInaccessibleImpl(el);
    if (name === "") {
      const placeholder = attr(el, "placeholder");
      const comment = placeholder
        ? `no label, placeholder ${quote(placeholder)}: use getByPlaceholderText or add a <label>`
        : `no label: add a <label>, aria-label or aria-labelledby`;
      out.push({
        line: line(el, role, "", hidden, comment),
        rank: placeholder && closeness(placeholder, el.node, text, normalizer) >= 0 ? 1 : 5,
      });
      continue;
    }
    const rank = closeness(name, el.node, text, normalizer, exact);
    out.push({
      line: line(el, role, name, hidden, rank >= 0 ? "similar label" : "labelled control"),
      rank: rank >= 0 ? 2 + rank : 10,
    });
  }
  return format("Labelled form controls", out);
}
