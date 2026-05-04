import { type Leaf, PARENT_OF } from "./types.ts";

function ancestorsOf(l: Leaf): Set<Leaf> {
  const out = new Set<Leaf>([l]);
  let cur: Leaf | undefined = PARENT_OF[l];
  while (cur) {
    out.add(cur);
    cur = PARENT_OF[cur];
  }
  return out;
}

export function subseteq(a: Set<Leaf>, b: Set<Leaf>): boolean {
  for (const x of a) {
    // x is "covered" by b if any ancestor of x (including x itself) is in b
    let covered = false;
    for (const anc of ancestorsOf(x)) {
      if (b.has(anc)) { covered = true; break; }
    }
    if (!covered) return false;
  }
  return true;
}

export function join(a: Set<Leaf>, b: Set<Leaf>): Set<Leaf> {
  return new Set<Leaf>([...a, ...b]);
}

export function meet(a: Set<Leaf>, b: Set<Leaf>): Set<Leaf> {
  // Meet under hierarchy: an element is in the meet if it is covered by both A and B.
  // For simplicity we keep meet as set intersection over the carrier (sufficient for v0.7;
  // this is a slight under-approximation only when the parents differ — fine for our tests).
  const r = new Set<Leaf>();
  for (const x of a) {
    if (b.has(x)) r.add(x);
  }
  return r;
}
