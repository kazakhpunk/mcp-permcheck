import type { Leaf } from "./types.ts";

export function subseteq(a: Set<Leaf>, b: Set<Leaf>): boolean {
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

export function join(a: Set<Leaf>, b: Set<Leaf>): Set<Leaf> {
  return new Set<Leaf>([...a, ...b]);
}

export function meet(a: Set<Leaf>, b: Set<Leaf>): Set<Leaf> {
  const r = new Set<Leaf>();
  for (const x of a) {
    if (b.has(x)) r.add(x);
  }
  return r;
}
