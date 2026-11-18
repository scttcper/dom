// https://html.spec.whatwg.org/#past-names-map
// A form remembers a previously used name until the control changes form owner. The reverse
// lookup lets a removal forget just that subtree's names, including in detached forms.
import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { F_FORM_ATTR, F_HAS_SHADOW, F_PARSER_FORM, F_PAST_NAMES } from "../../nodes/constants.ts";
import { isInclusiveAncestor, nextInTree, nextSkippingChildren } from "../../nodes/traverse.ts";
import { attr } from "../../nodes/attributes.ts";
import { T } from "../../nodes/tags.ts";
import { $externalFormNames, $impl, $pastNames, $shadowRoot } from "../../keys.ts";
import { formOwner } from "./form-associated.ts";
import type { HTMLFormElement } from "./HTMLFormElement.ts";

export class PastName extends WeakRef<NodeImpl> {
  history: Map<string, PastName>;
  names: string | string[];
  declare external?: ExternalWatch;

  constructor(history: Map<string, PastName>, name: string, el: NodeImpl) {
    super(el);
    this.history = history;
    this.names = name;
  }
}

const bindings = new WeakMap<NodeImpl, PastName>();

export function markNamedAncestors(node: NodeImpl): void {
  for (let p: NodeImpl | null = node; p !== null && (p.flags & F_PAST_NAMES) === 0; p = p.parent)
    p.flags |= F_PAST_NAMES;
}

export function rememberName(form: HTMLFormElement, name: string, el: NodeImpl): void {
  const names = (form[$pastNames] ??= new Map());
  let binding = bindings.get(el);
  if (binding?.names === name && binding.history === names) return;
  const previous = names.get(name);
  if (previous !== undefined) {
    if (previous === binding) return;
    const old = previous.deref();
    if (old !== undefined) {
      if (typeof previous.names === "string") releaseBinding(old, previous);
      else {
        previous.names.splice(previous.names.indexOf(name), 1);
        if (previous.names.length === 1) previous.names = previous.names[0];
      }
    }
  }
  if (binding === undefined) {
    binding = new PastName(names, name, el);
    bindings.set(el, binding);
    markNamedAncestors(el);
    watchExternalName(el, binding, form[$impl]);
  } else if (typeof binding.names === "string") binding.names = [binding.names, name];
  else binding.names.push(name);
  names.set(name, binding);
}

/** Controls with a form attribute depend on that particular ID. The null group covers the
 * parser's association to a form outside the control's ancestor chain. */
class ExternalWatch extends WeakRef<NodeImpl> {
  registry: ExternalNames;
  key: string | null;
  constructor(el: NodeImpl, registry: ExternalNames, key: string | null) {
    super(el);
    this.registry = registry;
    this.key = key;
  }

  check(): void {
    const el = this.deref();
    if (el !== undefined) checkNamedOwner(el);
  }
}

export class ExternalNames {
  groups = new Map<string | null, ExternalWatch | Set<ExternalWatch>>();
  collected = new FinalizationRegistry<ExternalWatch>((watch) => this.remove(watch));

  add(el: NodeImpl, key: string | null): ExternalWatch {
    const group = this.groups.get(key);
    const watch = new ExternalWatch(el, this, key);
    if (group === undefined) this.groups.set(key, watch);
    else if (group instanceof Set) group.add(watch);
    else this.groups.set(key, new Set([group, watch]));
    this.collected.register(el, watch, watch);
    return watch;
  }

  remove(watch: ExternalWatch): void {
    const group = this.groups.get(watch.key);
    if (group === watch || (group instanceof Set && group.delete(watch) && group.size === 0))
      this.groups.delete(watch.key);
    this.collected.unregister(watch);
  }

  check(key: string | null): void {
    const group = this.groups.get(key);
    if (group instanceof Set) {
      for (const watch of group) watch.check();
    } else group?.check();
  }
}

function releaseBinding(el: NodeImpl, binding: PastName): void {
  bindings.delete(el);
  binding.external?.registry.remove(binding.external);
}

function watchExternalName(el: NodeImpl, binding: PastName, form: NodeImpl): void {
  let key: string | null | undefined;
  if ((el.flags & F_FORM_ATTR) !== 0 && el.tag !== T.img) key = attr(el, "form") ?? undefined;
  if (key === undefined && (el.flags & F_PARSER_FORM) !== 0 && !isInclusiveAncestor(form, el)) key = null;
  const watch = binding.external;
  if (watch !== undefined) {
    if (watch.key === key && watch.registry === el.doc[$externalFormNames]) return;
    watch.registry.remove(watch);
    binding.external = undefined;
  }
  if (key !== undefined) binding.external = (el.doc[$externalFormNames] ??= new ExternalNames()).add(el, key);
}

export function checkNamedOwner(el: NodeImpl): void {
  const binding = bindings.get(el);
  if (binding === undefined) return;
  const owner = formOwner(el);
  if (owner !== null && (owner.node as HTMLFormElement)[$pastNames] === binding.history) {
    watchExternalName(el, binding, owner);
    return;
  }
  if (typeof binding.names === "string") binding.history.delete(binding.names);
  else for (const name of binding.names) binding.history.delete(name);
  releaseBinding(el, binding);
}

/** Removal or atomic move: unmarked branches contain no names to check. */
export function checkNamesInSubtree(root: NodeImpl): void {
  for (let n: NodeImpl | null = root; n !== null;) {
    if ((n.flags & F_PAST_NAMES) === 0) n = nextSkippingChildren(n, root);
    else {
      checkNamedOwner(n);
      n = nextInTree(n, root);
    }
  }
}

/** Only changed IDs can displace an outside control's owner. Controls moving with the subtree
 * also see their own connectedness or tree change (including inside a moved shadow host). */
export function checkExternalSubtree(root: NodeImpl, external: ExternalNames): void {
  for (let n: NodeImpl | null = root; n !== null; n = nextInTree(n, root)) {
    if (n.id !== "") external.check(n.id);
    if (n.tag === T.form) external.check(null);
    if ((n.flags & F_PAST_NAMES) !== 0 && (n.flags & (F_FORM_ATTR | F_PARSER_FORM)) !== 0) checkNamedOwner(n);
    if ((n.flags & F_HAS_SHADOW) !== 0) checkExternalSubtree((n.node as Element)[$shadowRoot]![$impl], external);
  }
}
