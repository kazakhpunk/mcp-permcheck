import { subseteq } from "./lattice.ts";
import { PARENT_OF } from "./types.ts";
import type { CallSite, Leaf, Verdict } from "./types.ts";

function isCovered(leaf: Leaf, declared: Set<Leaf>): boolean {
  // A leaf is covered if any ancestor (including itself) appears in declared.
  let cur: Leaf | undefined = leaf;
  while (cur !== undefined) {
    if (declared.has(cur)) return true;
    cur = PARENT_OF[cur];
  }
  return false;
}

export function check(
  tool: string,
  declared: Set<Leaf>,
  actual: Set<Leaf>,
  witnesses: Map<Leaf, CallSite[]>,
): Verdict {
  if (subseteq(actual, declared)) {
    return { kind: "OK", tool, declared, actual };
  }
  const undeclared = new Set<Leaf>();
  for (const l of actual) {
    if (!isCovered(l, declared)) undeclared.add(l);
  }
  return { kind: "VIOLATION", tool, declared, actual, undeclared, witnesses };
}
