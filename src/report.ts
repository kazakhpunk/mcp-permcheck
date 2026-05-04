import type { Leaf, Verdict } from "./types.ts";

function renderSet(s: Set<Leaf>): string {
  if (s.size === 0) return "{}";
  const sorted = [...s].sort();
  return `{${sorted.join(", ")}}`;
}

export function format(v: Verdict): string {
  if (v.kind === "OK") {
    return [
      `REPORT: tool "${v.tool}"`,
      `  declared = ${renderSet(v.declared)}`,
      `  actual   = ${renderSet(v.actual)}`,
      `  Verdict: OK`,
    ].join("\n");
  }
  if (v.kind === "UNANALYZABLE") {
    return [
      `REPORT: tool "${v.tool}"`,
      `  Verdict: UNANALYZABLE — ${v.reason}`,
    ].join("\n");
  }
  // VIOLATION
  const lines = [
    `REPORT: tool "${v.tool}"`,
    `  declared = ${renderSet(v.declared)}`,
    `  actual   = ${renderSet(v.actual)}`,
    `  Undeclared: ${[...v.undeclared].sort().join(", ")}`,
    `  Witnesses:`,
  ];
  for (const leaf of [...v.undeclared].sort()) {
    const sites = v.witnesses.get(leaf) ?? [];
    for (const s of sites) {
      lines.push(`    ${leaf.padEnd(7)} ${s.file}:${s.line}  ${s.symbol}`);
    }
  }
  lines.push(`  Verdict: VIOLATION`);
  return lines.join("\n");
}
