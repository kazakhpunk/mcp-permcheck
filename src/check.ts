import { subseteq } from "./lattice.ts";
import type { CallSite, Leaf, Verdict } from "./types.ts";

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
    if (!declared.has(l)) undeclared.add(l);
  }
  return { kind: "VIOLATION", tool, declared, actual, undeclared, witnesses };
}
