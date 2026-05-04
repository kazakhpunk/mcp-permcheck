# Sound Permission Verification for MCP Servers (v0)

Demonstrates formal `P_Actual ⊆ P_Declared` containment checking for MCP
server capabilities. See `docs/superpowers/specs/2026-05-04-sound-permissions-design.md`
for the full design rationale.

## Run the tests

    deno task test

## Open the walkthrough notebook

Requires the Deno Jupyter kernel:

    deno jupyter --install

Then open `walkthrough.ipynb` in Jupyter and select the Deno kernel.

## Project structure

- `src/` — six modules: lattice, sinks, parser, analyser, checker, reporter
- `tests/` — one test file per module, run with `deno task test`
- `demo-servers/` — three hand-authored MCP servers used as fixtures
- `walkthrough.ipynb` — narrative walkthrough; assertions live in cells
