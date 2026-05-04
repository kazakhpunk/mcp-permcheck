import type { Leaf } from "./types.ts";

const KEYWORD_RULES: Array<[RegExp, Leaf]> = [
  // EXEC
  [/\b(execute|executes|run|runs|spawn|spawns|invoke[-\s]command|kill|kills|terminate|terminates|shell)\b/i, "EXEC"],
  // NETWORK
  [/\b(http|fetch|fetches|request|requests|api|webhook|download|downloads|upload|uploads|send[-\s]request|sends an? http)\b/i, "NETWORK"],
  // WRITE
  [/\b(write|writes|delete|deletes|remove|removes|update|updates|insert|inserts|modify|modifies|create|creates|drop|drops|save|saves|store|stores|persist|persists)\b/i, "WRITE"],
  // READ
  [/\b(read|reads|fetch|fetches|query|queries|get|gets|list|lists|retrieve|retrieves|load|loads|view|views|show|shows|return|returns)\b/i, "READ"],
];

export function parse(description: string): Set<Leaf> {
  const out = new Set<Leaf>();
  for (const [re, leaf] of KEYWORD_RULES) {
    if (re.test(description)) out.add(leaf);
  }
  return out;
}
