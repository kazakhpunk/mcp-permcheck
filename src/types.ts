export type Leaf = "READ" | "WRITE" | "EXEC" | "NETWORK";

export const ALL_LEAVES: ReadonlySet<Leaf> = new Set(["READ", "WRITE", "EXEC", "NETWORK"]);

export interface CallSite {
  file: string;
  line: number;
  col: number;
  symbol: string;
}

export type Verdict =
  | { kind: "OK"; tool: string; declared: Set<Leaf>; actual: Set<Leaf> }
  | {
    kind: "VIOLATION";
    tool: string;
    declared: Set<Leaf>;
    actual: Set<Leaf>;
    undeclared: Set<Leaf>;
    witnesses: Map<Leaf, CallSite[]>;
  }
  | { kind: "UNANALYZABLE"; tool: string; reason: string };
