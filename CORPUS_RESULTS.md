# Corpus Evaluation Results

_Generated: 2026-05-05T13:23:06.743Z_

---

## Headline Stats

- **Servers attempted:** 80

### Outcome breakdown

| Outcome | Count |
|---|---|
| SUCCESS | 10 |
| NO_TOOLS_FOUND | 46 |
| NO_ENTRY_FILE | 24 |
| PARSE_ERROR | 0 |
| CLONE_FAILED | 0 |

### Among SUCCESS servers

- Servers successfully analysed: **10**
- Total tools inspected: **46**
- Tools that verified OK: **39** (84.8%)
- Tools with a VIOLATION: **7** (15.2%)

---

## Per-Leaf Undeclared Distribution

Across all violations, which capability leaves are most commonly undeclared:

| Leaf | Times flagged across servers |
|---|---|
| NETWORK_OUTBOUND | 5 |
| ENV | 4 |
| WRITE_FS | 1 |
| WRITE_DB | 1 |

---

## Top Violating Servers

Top 10 servers by violation count:

| Server | Violations | Undeclared leaves |
|---|---|---|
| perplexityai/modelcontextprotocol | 4 | ENV, NETWORK_OUTBOUND |
| modelcontextprotocol/servers#filesystem | 1 | WRITE_FS |
| google-gemini/gemini-cli | 1 | WRITE_DB |
| upstash/context7 | 1 | NETWORK_OUTBOUND |

---

## Comparison with MCPDiFF

MCPDiFF reported ~13% of 10,240 servers had significant mismatches (1,393 servers). We reach **~15.2% per-tool violation rate** on 46 tools from 10 TS servers from public sources.

Same shape, smaller scale. The path to 10k requires the Python adapter (v1 roadmap) and a broader tool-registration heuristic — currently 10 of 80 attempted servers were analysable with `server.tool()`, `server.registerTool()`, `setRequestHandler(ListToolsRequestSchema, …)` (with literal inline tools array), or `server.addTool({execute})` (fastmcp style); the remaining 70 used dynamic tool construction, decorators, or other custom abstractions not yet covered.

---

## Honest Disclosures

- **NO_TOOLS_FOUND** means the entry file was found but no tool registrations could be extracted. The analyser handles `server.tool()`, `server.registerTool()`, `setRequestHandler(ListToolsRequestSchema, …)` (literal inline tools array only), and `server.addTool({execute})` (fastmcp style). Dynamic tool construction (arrays built at runtime from imported schemas or function calls) is not yet supported.
- **NO_ENTRY_FILE** means no `.ts` file matching our heuristic was found — either the repo uses a non-standard structure or is primarily JavaScript / Python.
- **PARSE_ERROR** means the TypeScript Compiler API encountered a fatal error on the entry file (often due to missing imports or non-standard tsconfig options).
- **Cross-module function calls** into helpers outside the entry file are followed via the TS type-checker — but `npm install` is not run, so package resolution is best-effort. This may under-count some violations.
