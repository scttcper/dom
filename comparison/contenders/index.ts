// The contenders, in report column order. To add one, write `contenders/<name>.ts` exporting a
// Contender (see types.ts and README.md) and list it here.
import { ctrlDom, ctrlDomStack } from "./ctrl-dom.ts";
import { happyDom } from "./happy-dom.ts";
import { jsdom } from "./jsdom.ts";
import type { Contender } from "./types.ts";

export type { Contender } from "./types.ts";

export const CONTENDERS: readonly Contender[] = [jsdom, happyDom, ctrlDom, ctrlDomStack];

/** Contenders named in a comma-separated filter (all when empty). */
export function selectContenders(filter: string | undefined): Contender[] {
  if (!filter) return [...CONTENDERS];
  const ids = filter.split(",").filter(Boolean);
  for (const id of ids)
    if (!CONTENDERS.some((c) => c.id === id))
      throw new Error(`unknown contender ${id} (have: ${CONTENDERS.map((c) => c.id).join(", ")})`);
  return CONTENDERS.filter((c) => ids.includes(c.id));
}
