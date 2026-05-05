# Corpus Evaluation Results

_Generated: 2026-05-05T14:21:07.368Z_

---

## Headline Stats

- **Servers attempted:** 500

### Outcome breakdown

| Outcome | Count |
|---|---|
| SUCCESS | 84 |
| NO_TOOLS_FOUND | 298 |
| NO_ENTRY_FILE | 87 |
| PARSE_ERROR | 0 |
| CLONE_FAILED | 13 |

### Among SUCCESS servers

- Servers successfully analysed: **84**
- Total tools inspected: **648**
- Tools that verified OK: **405** (62.5%)
- Tools with a VIOLATION: **243** (37.5%)

---

## Per-Leaf Undeclared Distribution

Across all violations, which capability leaves are most commonly undeclared:

| Leaf | Times flagged across servers |
|---|---|
| NETWORK_OUTBOUND | 139 |
| ENV | 47 |
| WRITE_DB | 46 |
| WRITE_FS | 45 |
| READ_FS | 28 |
| READ_DB | 5 |
| EXEC_PROCESS | 1 |

---

## Top Violating Servers

Top 10 servers by violation count:

| Server | Violations | Undeclared leaves |
|---|---|---|
| illuminaresolutions/n8n-mcp-server | 32 | NETWORK_OUTBOUND |
| apinetwork/piapi-mcp-server | 22 | NETWORK_OUTBOUND |
| cjo4m06/mcp-shrimp-task-manager | 15 | ENV, WRITE_FS, READ_FS |
| joelhooks/logseq-mcp-tools | 15 | NETWORK_OUTBOUND |
| DMontgomery40/mcp-3D-printer-server | 13 | WRITE_DB, READ_FS, WRITE_FS |
| metorial/mcp-containers | 10 | NETWORK_OUTBOUND |
| ZubeidHendricks/youtube-mcp-server | 10 | WRITE_DB, READ_DB, ENV |
| containerelic/github-enterprise-mcp | 9 | WRITE_DB, NETWORK_OUTBOUND |
| ddukbg/github-enterprise-mcp | 9 | WRITE_DB, NETWORK_OUTBOUND |
| mcpdotdirect/evm-mcp-server | 8 | ENV |

---

## Comparison with MCPDiFF

MCPDiFF reported ~13% of 10,240 servers had significant mismatches (1,393 servers). We reach **~37.5% per-tool violation rate** on 648 tools from 84 TS servers from public sources.

Same shape, smaller scale. The path to 10k requires the Python adapter (v1 roadmap) and a broader tool-registration heuristic — currently 84 of 482 attempted servers were analysable with `server.tool()`, `server.registerTool()`, `setRequestHandler(ListToolsRequestSchema, …)` (with literal inline tools array), or `server.addTool({execute})` (fastmcp style); the remaining 398 used dynamic tool construction, decorators, or other custom abstractions not yet covered.

---

## Honest Disclosures

- **NO_TOOLS_FOUND** means the entry file was found but no tool registrations could be extracted. The analyser handles `server.tool()`, `server.registerTool()`, `setRequestHandler(ListToolsRequestSchema, …)` (literal inline tools array only), and `server.addTool({execute})` (fastmcp style). Dynamic tool construction (arrays built at runtime from imported schemas or function calls) is not yet supported.
- **NO_ENTRY_FILE** means no `.ts` file matching our heuristic was found — either the repo uses a non-standard structure or is primarily JavaScript / Python.
- **PARSE_ERROR** means the TypeScript Compiler API encountered a fatal error on the entry file (often due to missing imports or non-standard tsconfig options).
- **Cross-module function calls** into helpers outside the entry file are followed via the TS type-checker — but `npm install` is not run, so package resolution is best-effort. This may under-count some violations.
