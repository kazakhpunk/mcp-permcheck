export type Leaf =
  | "READ" | "READ_FS" | "READ_DB"
  | "WRITE" | "WRITE_FS" | "WRITE_DB"
  | "EXEC" | "EXEC_PROCESS" | "EXEC_SHELL" | "EXEC_EVAL"
  | "NETWORK" | "NETWORK_OUTBOUND"
  | "ENV";

export const ALL_LEAVES: ReadonlySet<Leaf> = new Set([
  "READ", "READ_FS", "READ_DB",
  "WRITE", "WRITE_FS", "WRITE_DB",
  "EXEC", "EXEC_PROCESS", "EXEC_SHELL", "EXEC_EVAL",
  "NETWORK", "NETWORK_OUTBOUND",
  "ENV",
]);

export const PARENT_OF: Readonly<Partial<Record<Leaf, Leaf>>> = {
  READ_FS: "READ",
  READ_DB: "READ",
  WRITE_FS: "WRITE",
  WRITE_DB: "WRITE",
  EXEC_PROCESS: "EXEC",
  EXEC_SHELL: "EXEC",
  EXEC_EVAL: "EXEC",
  NETWORK_OUTBOUND: "NETWORK",
};

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
