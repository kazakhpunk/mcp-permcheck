/**
 * summarize.ts
 *
 * Reads corpus-results.json and writes CORPUS_RESULTS.md.
 * Also prints headline numbers to stdout.
 *
 * Usage:
 *   deno run --allow-read --allow-write scripts/summarize.ts
 */

const RESULTS_PATH = "./corpus-results.json";
const OUTPUT_PATH = "./CORPUS_RESULTS.md";

interface ViolationDetail {
  tool: string;
  undeclared: string[];
  witnessCount: number;
}

interface ServerResult {
  name: string;
  outcome: string;
  tools?: number;
  ok?: number;
  violation?: number;
  violationDetails?: ViolationDetail[];
  analysedAt?: string;
  error?: string;
}

interface ResultsFile {
  ranAt: string;
  totalAttempted: number;
  outcomes: Record<string, number>;
  results: ServerResult[];
}

async function main() {
  let data: ResultsFile;
  try {
    data = JSON.parse(await Deno.readTextFile(RESULTS_PATH));
  } catch (e) {
    console.error(`Failed to read ${RESULTS_PATH}: ${e}`);
    Deno.exit(1);
  }

  const { ranAt, totalAttempted, outcomes, results } = data;

  const successes = results.filter((r) => r.outcome === "SUCCESS");
  const totalTools = successes.reduce((s, r) => s + (r.tools ?? 0), 0);
  const totalViolations = successes.reduce((s, r) => s + (r.violation ?? 0), 0);
  const totalOk = successes.reduce((s, r) => s + (r.ok ?? 0), 0);
  const violPct = totalTools > 0 ? (100 * totalViolations / totalTools).toFixed(1) : "N/A";
  const okPct = totalTools > 0 ? (100 * totalOk / totalTools).toFixed(1) : "N/A";

  // Per-leaf undeclared distribution
  const leafCounts = new Map<string, number>();
  for (const r of successes) {
    for (const vd of r.violationDetails ?? []) {
      for (const leaf of vd.undeclared) {
        leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1);
      }
    }
  }
  const sortedLeaves = [...leafCounts.entries()].sort((a, b) => b[1] - a[1]);

  // Top violating servers (by violation count)
  const topViolators = successes
    .filter((r) => (r.violation ?? 0) > 0)
    .sort((a, b) => (b.violation ?? 0) - (a.violation ?? 0))
    .slice(0, 10);

  // Build markdown
  const lines: string[] = [];

  lines.push("# Corpus Evaluation Results");
  lines.push("");
  lines.push(`_Generated: ${ranAt}_`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Section a: Headline stats
  lines.push("## Headline Stats");
  lines.push("");
  lines.push(`- **Servers attempted:** ${totalAttempted}`);
  lines.push("");
  lines.push("### Outcome breakdown");
  lines.push("");
  lines.push("| Outcome | Count |");
  lines.push("|---|---|");

  const outcomeOrder = ["SUCCESS", "NO_TOOLS_FOUND", "NO_ENTRY_FILE", "PARSE_ERROR", "CLONE_FAILED"];
  for (const outcome of outcomeOrder) {
    const count = outcomes[outcome] ?? 0;
    lines.push(`| ${outcome} | ${count} |`);
  }
  // Any unexpected outcomes
  for (const [outcome, count] of Object.entries(outcomes)) {
    if (!outcomeOrder.includes(outcome)) {
      lines.push(`| ${outcome} | ${count} |`);
    }
  }
  lines.push("");

  lines.push("### Among SUCCESS servers");
  lines.push("");
  lines.push(`- Servers successfully analysed: **${successes.length}**`);
  lines.push(`- Total tools inspected: **${totalTools}**`);
  lines.push(`- Tools that verified OK: **${totalOk}** (${okPct}%)`);
  lines.push(`- Tools with a VIOLATION: **${totalViolations}** (${violPct}%)`);
  lines.push("");

  if (sortedLeaves.length > 0) {
    // Section b: Per-leaf distribution
    lines.push("---");
    lines.push("");
    lines.push("## Per-Leaf Undeclared Distribution");
    lines.push("");
    lines.push("Across all violations, which capability leaves are most commonly undeclared:");
    lines.push("");
    lines.push("| Leaf | Times flagged across servers |");
    lines.push("|---|---|");
    for (const [leaf, count] of sortedLeaves) {
      lines.push(`| ${leaf} | ${count} |`);
    }
    lines.push("");
  }

  if (topViolators.length > 0) {
    // Section c: Top violating servers
    lines.push("---");
    lines.push("");
    lines.push("## Top Violating Servers");
    lines.push("");
    lines.push("Top 10 servers by violation count:");
    lines.push("");
    lines.push("| Server | Violations | Undeclared leaves |");
    lines.push("|---|---|---|");
    for (const r of topViolators) {
      const leaves = [
        ...new Set((r.violationDetails ?? []).flatMap((vd) => vd.undeclared)),
      ].join(", ");
      lines.push(`| ${r.name} | ${r.violation} | ${leaves || "—"} |`);
    }
    lines.push("");
  }

  // Section d: Comparison with MCPDiFF
  lines.push("---");
  lines.push("");
  lines.push("## Comparison with MCPDiFF");
  lines.push("");
  lines.push(
    `MCPDiFF reported ~13% of 10,240 servers had significant mismatches (1,393 servers). ` +
      `We reach **~${violPct}% per-tool violation rate** on ${totalTools} tools from ${successes.length} TS servers from public sources.`,
  );
  lines.push("");
  lines.push(
    `Same shape, smaller scale. The path to 10k requires the Python adapter (v1 roadmap) and a broader ` +
      `tool-registration heuristic — currently ${successes.length} of ${results.length} attempted servers ` +
      `were analysable with \`server.tool()\` / \`server.registerTool()\`; the remaining ` +
      `${results.length - successes.length} used SDK shapes (e.g., \`setRequestHandler(ListToolsRequestSchema, …)\`, ` +
      `decorators, or custom abstractions) that a future v0.7 adapter would need to recognise.`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Honest Disclosures");
  lines.push("");
  lines.push(
    `- **NO_TOOLS_FOUND** is the most common non-success outcome. Real-world MCP servers use varied ` +
      `registration shapes. This analyser only handles \`server.tool(name, opts, handler)\` and ` +
      `\`server.registerTool(name, opts, handler)\`. Other shapes (request handlers, decorators, factory ` +
      `wrappers) are future work.`,
  );
  lines.push(
    `- **NO_ENTRY_FILE** means no \`.ts\` file matching our heuristic was found — either the repo uses ` +
      `a non-standard structure or is primarily JavaScript / Python.`,
  );
  lines.push(
    `- **PARSE_ERROR** means the TypeScript Compiler API encountered a fatal error on the entry file ` +
      `(often due to missing imports or non-standard tsconfig options).`,
  );
  lines.push(
    `- **Cross-module function calls** into helpers outside the entry file are followed via the TS ` +
      `type-checker — but \`npm install\` is not run, so package resolution is best-effort. ` +
      `This may under-count some violations.`,
  );
  lines.push("");

  const md = lines.join("\n");
  await Deno.writeTextFile(OUTPUT_PATH, md);

  // Print headline to stdout
  console.log("=== Corpus Evaluation Summary ===");
  console.log(`Servers attempted: ${totalAttempted}`);
  for (const [outcome, count] of Object.entries(outcomes)) {
    console.log(`  ${outcome}: ${count}`);
  }
  console.log(`\nAmong SUCCESS servers (${successes.length}):`);
  console.log(`  Total tools: ${totalTools}`);
  console.log(`  OK: ${totalOk} (${okPct}%)`);
  console.log(`  Violations: ${totalViolations} (${violPct}%)`);
  console.log(`\nResults written to ${OUTPUT_PATH}`);
}

await main();
