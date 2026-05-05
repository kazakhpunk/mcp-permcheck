# Corpus Evaluation Results

_Generated: 2026-05-05T12:47:21.408Z_

---

## Headline Stats

- **Servers attempted:** 80

### Outcome breakdown

| Outcome | Count |
|---|---|
| SUCCESS | 9 |
| NO_TOOLS_FOUND | 30 |
| NO_ENTRY_FILE | 41 |
| PARSE_ERROR | 0 |
| CLONE_FAILED | 0 |

### Among SUCCESS servers

- Servers successfully analysed: **9**
- Total tools inspected: **39**
- Tools that verified OK: **32** (82.1%)
- Tools with a VIOLATION: **7** (17.9%)

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

MCPDiFF reported ~13% of 10,240 servers had significant mismatches (1,393 servers). We reach **~17.9% per-tool violation rate** on 39 tools from 9 TS servers from public sources.

Same shape, smaller scale. The path to 10k requires the Python adapter (v1 roadmap) and a broader tool-registration heuristic — currently 9 of 80 attempted servers were analysable with `server.tool()` / `server.registerTool()`; the remaining 71 used SDK shapes (e.g., `setRequestHandler(ListToolsRequestSchema, …)`, decorators, or custom abstractions) that a future v0.7 adapter would need to recognise.

---

## Honest Disclosures

- **NO_TOOLS_FOUND** is the most common non-success outcome. Real-world MCP servers use varied registration shapes. This analyser only handles `server.tool(name, opts, handler)` and `server.registerTool(name, opts, handler)`. Other shapes (request handlers, decorators, factory wrappers) are future work.
- **NO_ENTRY_FILE** means no `.ts` file matching our heuristic was found — either the repo uses a non-standard structure or is primarily JavaScript / Python.
- **PARSE_ERROR** means the TypeScript Compiler API encountered a fatal error on the entry file (often due to missing imports or non-standard tsconfig options).
- **Cross-module function calls** into helpers outside the entry file are followed via the TS type-checker — but `npm install` is not run, so package resolution is best-effort. This may under-count some violations.
